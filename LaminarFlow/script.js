import * as THREE from 'https://unpkg.com/three@0.134.0/build/three.module.js';
import * as CANNON from 'https://unpkg.com/cannon-es@0.19.0/dist/cannon-es.js';

/** Class representing one of the four suspension towers in the simulation. */
class Tower {
  /**
   * Creates a Tower.
   * @param {number} x - The x-coordinate of the center of the tower's bottom base.
   * @param {number} z - The z-coordinate of the center of the tower's bottom base.
   * @param {number} radius - The radius of the tower's base in meters.
   * @param {number} height - The height of the tower in meters.
   * @param {THREE.Scene} scene - The scene to which the object’s mesh will be added.
   * @param {CANNON.World} world - The physics world to which the object’s body will be added.
   */
  constructor(x, z, radius, height, scene, world) {
    this.radius = radius;
    this.height = height;

    // Create a gray cylinder mesh for the tower and add it to the scene.
    const geom = new THREE.CylinderGeometry(radius, radius, height, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(x, height / 2, z);
    scene.add(this.mesh);

    // Create a static cylinder body for the tower and add it to the physics world.
    const shape = new CANNON.Cylinder(radius, radius, height, 16);
    this.body = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(x, height / 2, z),
      shape: shape
    });
    world.addBody(this.body);
  }
}

/** Class representing a single bridge segment. */
class BridgeSegment {
  /**
   * Creates a BridgeSegment.
   * @param {number} index - The index of this segment along the bridge deck.
   * @param {number} segmentLength - The length of this segment in meters.
   * @param {number} segmentHeight - The height (thickness) of this segment in meters.
   * @param {number} deckWidth - The width of the bridge deck in meters.
   * @param {number} totalBridgeLength - The total length of the bridge in meters.
   * @param {THREE.Scene} scene - The scene to which the segment’s mesh will be added.
   * @param {CANNON.World} world - The physics world to which the segment’s body will be added.
   */
  constructor(index, segmentLength, segmentHeight, deckWidth, totalBridgeLength, scene, world) {
    this.index = index;

    // Calculate segment center, create a gray box mesh, position it at (center, 0, 0), and add it to the scene.
    const center = -totalBridgeLength / 2 + segmentLength / 2 + index * segmentLength;
    const geom = new THREE.BoxGeometry(segmentLength, segmentHeight, deckWidth);
    const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(center, 0, 0);
    scene.add(this.mesh);

    // Create a box body for the segment and add it to the physics world.
    const shape = new CANNON.Box(new CANNON.Vec3(segmentLength / 2, segmentHeight / 2, deckWidth / 2));
    this.body = new CANNON.Body({
      mass: 20,
      position: new CANNON.Vec3(center, 0, 0),
      shape: shape
    });
    world.addBody(this.body);
  }
}

/**
 * Class representing the entire bridge.
 */
class Bridge {
  /** Creates a Bridge composed of multiple segments connected by spring constraints. */
  constructor(numSegments, totalBridgeLength, deckWidth, segmentHeight, scene, world, towers) {
    this.numSegments = numSegments;             // The number of segments that form the bridge.
    this.totalBridgeLength = totalBridgeLength; // The overall length of the bridge in meters.
    this.segmentLength = totalBridgeLength / numSegments; // The length of each bridge segment in meters.
    this.deckWidth = deckWidth;                 // The width of the bridge deck in meters.
    this.segmentHeight = segmentHeight;         // The thickness (vertical height) of each bridge segment in meters.
    this.segments = [];                         // An array to store the bridge segments.
    this.world = world;                         // The physics world where the bridge bodies will be simulated.
    this.scene = scene;                         // The scene in which the bridge mesh will be rendered.

    // Create bridge segments.
    for (let i = 0; i < numSegments; i++) {
      const seg = new BridgeSegment(i, this.segmentLength, segmentHeight, deckWidth, totalBridgeLength, scene, world);
      this.segments.push(seg);
    }
    
    // Connect adjacent segments via spring constraints connected to their corners.
    this.frontSprings = [];
    this.backSprings = [];
    for (let i = 0; i < numSegments - 1; i++) {
      // Front spring: connect right-front corner of segment i to left-front corner of segment i+1.
      const frontSpring = this.createSpring(i, -deckWidth / 2)
      this.frontSprings.push(frontSpring);

      // Back spring: connect right-back corner of segment i to left-back corner of segment i+1.
      const backSpring = this.createSpring(i, deckWidth / 2)
      this.backSprings.push(backSpring);
    }

    // Attach end segments to towers at tower bottoms.
    const lfConstraint = this.createConstraint(-this.segmentLength / 2, -deckWidth / 2, 0, towers.lfTower);
    world.addConstraint(lfConstraint);
    const lbConstraint = this.createConstraint(-this.segmentLength / 2, deckWidth / 2, 0, towers.lbTower);
    world.addConstraint(lbConstraint);
    const rfConstraint = this.createConstraint(this.segmentLength / 2, -deckWidth / 2, numSegments - 1, towers.rfTower);
    world.addConstraint(rfConstraint);
    const rbConstraint = this.createConstraint(this.segmentLength / 2, deckWidth / 2, numSegments - 1, towers.rbTower);
    world.addConstraint(rbConstraint);
    
    // Create visible connector lines for each spring connection.
    this.frontConnectorLines = [];
    this.backConnectorLines = [];
    for (let i = 0; i < numSegments - 1; i++) {
      this.frontConnectorLines.push(Bridge.createConnectorLine(this.scene, 0xff0000));
      this.backConnectorLines.push(Bridge.createConnectorLine(this.scene, 0xff0000));
    }
  }

  // Create a spring connecting segment i and segment i+1 at the specified deck edge.
  createSpring(i, frontEdgeZ) {
    const restLength = 0.0125;  // The rest length of the spring in meters.
    const stiffness = 5000;     // The stiffness of the spring in newtons per meter (N/m).
    const damping = 50;         // The damping coefficient of the spring in newton-seconds per meter (N·s/m).
    
    return new CANNON.Spring(
        this.segments[i].body,
        this.segments[i + 1].body,
        {
          localAnchorA: new CANNON.Vec3(this.segmentLength / 2, -this.segmentHeight / 2, frontEdgeZ),
          localAnchorB: new CANNON.Vec3(-this.segmentLength / 2, -this.segmentHeight / 2, frontEdgeZ),
          restLength: restLength,
          stiffness: stiffness,
          damping: damping
        }
      );
  }

  /** Creates a point-to-point constraint that attaches a bridge segment's edge to a tower's bottom. */
  createConstraint(leftEdgeX, frontEdgeZ, segmentIndex, tower) {
    const attachMaxForce = 1e6; // The maximum allowable force for attachment constraints in N.
    return new CANNON.PointToPointConstraint(
      this.segments[segmentIndex].body,
      new CANNON.Vec3(leftEdgeX, -this.segmentHeight / 2, frontEdgeZ),
      tower.body,
      new CANNON.Vec3(0, -tower.height / 2, 0),
      attachMaxForce
    );
  }

  /** Updates the visible connector lines for the spring connections. */
  updateConnectors() {
    for (let i = 0; i < this.numSegments - 1; i++) {
      // Update front connector: use the world positions of the local anchors.
      const [worldA_front, worldB_front] = this.updateConnector(i, -this.deckWidth / 2)
      this.frontConnectorLines[i].geometry.setFromPoints([worldA_front, worldB_front]);
      
      // Update back connector: use the world positions of the local anchors.
      const [worldA_back, worldB_back] = this.updateConnector(i, this.deckWidth / 2)
      this.backConnectorLines[i].geometry.setFromPoints([worldA_back, worldB_back]);
    }
  }

  /** Compute and return the world-space positions of the connector anchors for segments i and i+1 at the specified deck edge. */
  updateConnector(i, frontEdgeZ) {
    // Define local anchor points at the bottom of a segment: localAnchorA is at the right edge and localAnchorB is at the left edge.
    const localAnchorA = new THREE.Vector3(this.segmentLength / 2, -this.segmentHeight / 2, frontEdgeZ);
    const localAnchorB = new THREE.Vector3(-this.segmentLength / 2, -this.segmentHeight / 2, frontEdgeZ);
    
    // Transform the local anchor points into world-space coordinates using the respective segment meshes' transformation matrices.
    const worldA = localAnchorA.applyMatrix4(this.segments[i].mesh.matrixWorld);
    const worldB = localAnchorB.applyMatrix4(this.segments[i + 1].mesh.matrixWorld);
    return [worldA, worldB]
  }

  /** Applies spring forces between adjacent segments. */
  applySprings() {
    this.frontSprings.forEach(spring => spring.applyForce());
    this.backSprings.forEach(spring => spring.applyForce());
  }

  /** Creates a visible connector line. */
  static createConnectorLine(scene) {
    const color = 0xff0000 // Red color

    // Create a BufferGeometry initialized with placeholders for a line's endpoints.
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    
    // Create a line material with the given color, build a line from the geometry and material, and add it to the scene.
    const mat = new THREE.LineBasicMaterial({ color: color });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    return line;
  }
}

/** Class handling wind vector visualization and interaction. */
class WindController {
  /** Creates a WindController that visualizes the wind vector and manages user interaction. */
  constructor(scene, camera) {
    this.scene = scene;     // The scene in which the wind arrow will be added.
    this.camera = camera;   // The camera used for raycasting to determine mouse interactions.
    this.windDirection = new THREE.Vector3(1, 0, 0).normalize();
  
    // Create the wind arrow with a specified origin and dimensions, and add it to the scene.
    const arrowOrigin = new THREE.Vector3(7, 0, 0);
    const arrowLength = 3, headLength = 1, headWidth = 0.5;
    this.arrowOrigin = arrowOrigin;
    this.arrowHelper = new THREE.ArrowHelper(this.windDirection, arrowOrigin, arrowLength, 0xff0000, headLength, headWidth);
    scene.add(this.arrowHelper);
  
    // Initialize raycaster, mouse vector, and a horizontal plane for mouse interactions.
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dragging = false;
  
    // Set up mouse event listeners for wind vector control.
    this._setupMouseEvents();
  }

  /** Computes the intersection point of the mouse event ray with the horizontal plane. */
  updateMousePosition(event, raycaster, camera) {
    // Convert mouse position to normalized device coordinates
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    // Update the raycaster with the normalized mouse coordinates and the camera
    raycaster.setFromCamera(mouse, camera);
  }

  /**
   * Sets up mouse event listeners for wind vector interaction.
   * @private
   */
  _setupMouseEvents() {
    // Setup mousedown event to start dragging if the wind arrow is clicked.
    document.addEventListener('mousedown', (event) => {
        this.updateMousePosition(event, this.raycaster, this.camera)
      
        // Check for intersections with the wind arrow's line and cone.
        const arrowObjs = [this.arrowHelper.line, this.arrowHelper.cone];
        const intersects = this.raycaster.intersectObjects(arrowObjs, true);
      
        // If an intersection is found, start dragging.
        if (intersects.length > 0) { this.dragging = true; }
    });
    
    // Setup mousemove event to update the wind direction while dragging.
    document.addEventListener('mousemove', (event) => {
      if (this.dragging) {
        this.updateMousePosition(event, this.raycaster, this.camera)
        
        // Check if the ray intersects the horizontal plane (y = 0)
        const intersectionPoint = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.plane, intersectionPoint)) {
          const newDir = new THREE.Vector3().subVectors(intersectionPoint, this.arrowOrigin);
          newDir.y = 0; // Constrain the wind direction to the horizontal plane

          // If the new direction is sufficiently large, normalize it and update the wind direction
          if (newDir.lengthSq() > 0.001) {
            newDir.normalize();
            this.windDirection.copy(newDir);
            this.arrowHelper.setDirection(this.windDirection);
          }
        }
      }
    });
    document.addEventListener('mouseup', () => { this.dragging = false; });
  }
}

/** Main Simulation class that sets up and runs the simulation. */
class Simulation {
  /** Initializes the simulation. */
  constructor() {
    // Simulation parameters.
    this.totalBridgeLength = 10;                // Total length of the bridge in meters.
    this.deckWidth = 2;                         // Width of the bridge deck in meters.
    this.segmentHeight = 0.1;                   // Height (thickness) of each bridge segment in meters.
    this.numSegments = 10;                      // Total number of segments composing the bridge.
    this.segmentLength = this.totalBridgeLength / this.numSegments;  // Length of each individual bridge segment.
    this.windForceMagnitude = 250;              // Average wind force in N.

    // Tower parameters.
    this.towerRadius = 0.1;                     // Radius of each tower in meters.
    this.towerHeight = 2;                       // Height of each tower in meters.
    this.leftX = -this.totalBridgeLength / 2;   // x-coordinate of the left edge of the bridge.
    this.rightX = this.totalBridgeLength / 2;   // x-coordinate of the right edge of the bridge.
    this.frontZ = -this.deckWidth / 2;          // z-coordinate of the front edge of the deck.
    this.backZ = this.deckWidth / 2;            // z-coordinate of the back edge of the deck.
    
    // Get the canvas element from the DOM.
    this.canvas = document.getElementById('canvas');

    // Create the WebGL renderer with antialiasing enabled.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Create a perspective camera with a 75° field of view and appropriate aspect ratio.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(2, 5, 12);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5)); // Add ambient light to the scene.
    
    // Setup physics world.
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    
    // Create towers.
    this.towers = {
      lfTower: new Tower(this.leftX, this.frontZ, this.towerRadius, this.towerHeight, this.scene, this.world),
      lbTower: new Tower(this.leftX, this.backZ, this.towerRadius, this.towerHeight, this.scene, this.world),
      rfTower: new Tower(this.rightX, this.frontZ, this.towerRadius, this.towerHeight, this.scene, this.world),
      rbTower: new Tower(this.rightX, this.backZ, this.towerRadius, this.towerHeight, this.scene, this.world)
    };
    
    // Create the bridge.
    this.bridge = new Bridge(this.numSegments, this.totalBridgeLength, this.deckWidth, this.segmentHeight, this.scene, this.world, this.towers);
    
    // Create wind controller.
    this.windController = new WindController(this.scene, this.camera);
    
    // Bind animate and setup resize.
    this.animate = this.animate.bind(this);
    this._setupResize();
    this.animate();
  }

  /**
   * Sets up a window resize listener.
   * @private
   */
  _setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** The main animation loop. */
  animate() {
    requestAnimationFrame(this.animate);
    this.world.step(1 / 60);
    
    // Update each bridge segment.
    this.bridge.segments.forEach((seg) => {
      // Update the mesh to match the physics body's position and rotation.
      seg.mesh.position.copy(seg.body.position);
      seg.mesh.quaternion.copy(seg.body.quaternion);

      // Calculate the wind force vector based on the wind direction.
      const windForce = new CANNON.Vec3(
        this.windController.windDirection.x * this.windForceMagnitude,
        0,
        this.windController.windDirection.z * this.windForceMagnitude
      );
      
      // Apply the wind force to the physics body at its current position.
      seg.body.applyForce(windForce, seg.body.position);
    });
    
    // Apply spring forces between segments.
    this.bridge.applySprings();
    
    // Update visible connector lines for spring connections.
    this.bridge.updateConnectors();
    
    this.renderer.render(this.scene, this.camera);
  }
}

// Ensure the simulation instance is globally accessible
window.sim = new Simulation();

// Create a slider element to adjust wind force magnitude between 0 and 250 N.
const windSlider = document.createElement('input');
windSlider.type = 'range';
windSlider.min = '0';
windSlider.max = '250';
windSlider.value = '250';
windSlider.step = '1';
windSlider.style.position = 'absolute';
windSlider.style.top = '10px';
windSlider.style.left = '10px';
windSlider.style.zIndex = '100';
document.body.appendChild(windSlider);

// Update the simulation's windForceMagnitude when the slider value changes.
windSlider.addEventListener('input', (event) => {
  window.sim.windForceMagnitude = Number(event.target.value);
});
