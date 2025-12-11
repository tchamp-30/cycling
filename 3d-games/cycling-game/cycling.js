import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let isPaused = true;
let roadPieces = []; // Array to store references to all road pieces
let cones = []; // Array to store references to all obstacle cones
let baseRoadSpeed = 3; // Starting speed of road movement (units per second)
let roadSpeed = 3; // Current speed of road movement (affected by pause state)
let previousTime = 0; // Track time for deltaTime calculation
let gameStartTime = 0; // Track when the game started (for speed increase)
let lastSpeedIncreaseTime = 0; // Track when speed was last increased
const speedIncreaseInterval = 1.0; // Increase speed every 1 second
const speedIncreaseAmount = 0.5; // Increase speed by 0.5 units per second each interval
const offScreenThreshold = 20; // Z position threshold - pieces beyond this are off-screen (camera is at z=10)
const roadPieceLength = 25; // Length of each road piece
let bikerModel = null; // Reference to the biker model
//let wheelComponents = []; // Array to store wheel components (Spokes, Rims, Tyres)
let frontWheelComponents = []; // Array to store front wheel components (Spokes, Rims, Tyres)
let backWheelComponents = []; // Array to store back wheel components (Spokes, Rims, Tyres)
let legComponents = []; // Array to store leg components for pedaling animation
let pedalingAngle = 0; // Current pedaling angle
let keysPressed = []; // Array to store the keys that are currently pressed
let bikerXOffset = 0; // Manual X position offset from user input (arrow keys)
let score = 0; // Player's score
let countedCones = new Set(); // Track which cones have already been counted for points
let coneWasInFront = new Map(); // Track if each cone was previously in front of biker
let gameOver = false; // Track if the game has ended
let bikerModelLoaded = false; // Track if biker model has loaded
let conesToLoad = 0; // Total number of cones to load
let conesLoaded = 0; // Number of cones that have loaded

const bladeGeometry = new THREE.PlaneGeometry(0.1, 0.5);
const grassTexture = createGrassTexture();
const material = new THREE.MeshStandardMaterial({
        map: grassTexture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        color: 0x228B22
    });

const roadTextureLoader = new THREE.TextureLoader();
const roadTexture = roadTextureLoader.load('textures/road-texture.jpeg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4); // Repeat texture along the length of the road
});

function createScene() {
    const scene = new THREE.Scene();
    return scene;
}

function setupCamera() {
    const container = document.getElementById('game-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, 0);
    return camera;
}

function setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
}

function createGround() {
    const groundGeom = new THREE.PlaneGeometry(200, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
    return ground;
}

function createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Create a simple grass blade texture with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(34, 139, 34, 0.8)'); // Forest green at top
    gradient.addColorStop(0.5, 'rgba(50, 205, 50, 0.9)'); // Lime green in middle
    gradient.addColorStop(1, 'rgba(34, 139, 34, 0.3)'); // Fade at bottom
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    // Add some variation
    ctx.fillStyle = 'rgba(0, 100, 0, 0.5)';
    ctx.fillRect(20, 0, 24, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function createGrassBlades() {
    const instanceCount = 30000;
    const instancedMesh = new THREE.InstancedMesh(bladeGeometry, material, instanceCount);
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const euler = new THREE.Euler();

    // Road dimensions (centered at x=0, z=0)
    const roadWidth = 8;
    const roadLength = 100;
    // The road may repeat or be placed multiple times, but here we restrict one at the center.
    // You may need to update this if the road moves.

    let placed = 0;
    let tries = 0;
    // We'll allow up to instanceCount * 2 tries for generation to account for retries
    while (placed < instanceCount && tries < instanceCount * 2) {
        tries++;
        // Random position on ground plane
        position.x = (Math.random() - 0.5) * 200;
        position.y = 0.25; // Half the blade height
        position.z = (Math.random() - 0.5) * 100;

        // Check if this position is outside the road area
        // The road is centered at x=0, covers z in [-roadLength/2, roadLength/2], and spans width in x
        if (
            position.x > -roadWidth/2 && position.x < roadWidth/2 &&
            position.z > -roadLength/2 && position.z < roadLength/2
        ) {
            // Grass would be *on the road* - skip
            continue;
        }
        
        // Random rotation around Y axis
        const rotationY = Math.random() * Math.PI * 2;
        
        // Random slight tilt
        const tiltX = (Math.random() - 0.5) * 0.3;
        const tiltZ = (Math.random() - 0.5) * 0.3;
        
        // Create crisscross effect - some blades rotated 90 degrees
        const crossRotation = Math.random() > 0.5 ? Math.PI / 2 : 0;
        
        // Set Euler angles (X, Y, Z)
        euler.set(tiltX, rotationY + crossRotation, tiltZ);
        matrix.makeRotationFromEuler(euler);
        matrix.setPosition(position);
        
        instancedMesh.setMatrixAt(placed, matrix);
        placed++;
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    scene.add(instancedMesh);
    
    return instancedMesh;
}

function createRoadPiece() {
    const geom = new THREE.BoxGeometry(8, 0.01, 25);
    
    // Modify UV coordinates to map texture correctly to top face
    // BoxGeometry face order: 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back
    // Each face has 6 vertices (2 triangles), each vertex has 2 UV coords
    const uvAttribute = geom.attributes.uv;
    const uvArray = uvAttribute.array;
    
    // Top face UV indices start at: faceIndex(2) * verticesPerFace(6) * coordsPerVertex(2) = 24
    const topFaceStart = 24;
    
    // Set UV coordinates for top face to map texture across the road surface
    // Road is 8 units wide and 25 units long
    // Map texture to repeat along length (Z axis maps to V, X axis maps to U)
    // First triangle
    uvArray[topFaceStart] = 0;     uvArray[topFaceStart + 1] = 0;  // Bottom-left
    uvArray[topFaceStart + 2] = 1; uvArray[topFaceStart + 3] = 0; // Bottom-right  
    uvArray[topFaceStart + 4] = 0; uvArray[topFaceStart + 5] = 4; // Top-left (repeat 4x along length)
    // Second triangle
    uvArray[topFaceStart + 6] = 1; uvArray[topFaceStart + 7] = 0;  // Bottom-right
    uvArray[topFaceStart + 8] = 1; uvArray[topFaceStart + 9] = 4;  // Top-right (repeat 4x along length)
    uvArray[topFaceStart + 10] = 0; uvArray[topFaceStart + 11] = 4; // Top-left
    
    uvAttribute.needsUpdate = true;
    
    const mat = new THREE.MeshStandardMaterial({ 
        map: roadTexture,
        color: 0x888888, // Gray color - will show even if texture doesn't load
        side: THREE.DoubleSide
    });
    
    // Force material to update when texture loads
    if (roadTexture) {
        roadTexture.addEventListener('load', () => {
            mat.needsUpdate = true;
        });
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
}

function createRoad() {
    const road = new THREE.Group();
    roadPieces = []; // Initialize/reset the array
    let zPosition = -45;
    for (let i = 0; i < 10; i++) {
        const piece = createRoadPiece();
        piece.position.set(0, 0.1, zPosition);
        zPosition += 25;
        road.add(piece);
        roadPieces.push(piece); // Store reference in array
    }
    scene.add(road);
    return road;
}

function pauseGame() {
    isPaused = true;
}

function resumeGame() {
    isPaused = false;
}

function determineRoadMovement() {
    // Only modify speed based on pause state, don't reset to hardcoded value
    if (isPaused || gameOver) {
        roadSpeed = 0;
    } else {
        // Speed increases over time
        roadSpeed = baseRoadSpeed; // Start with base speed, will be increased over time
    }
}

function increaseSpeedOverTime(currentTime) {
    // Only increase speed if game is running (not paused, not game over)
    if (isPaused || gameOver) return;
    
    // Initialize game start time on first call
    if (gameStartTime === 0) {
        gameStartTime = currentTime;
        lastSpeedIncreaseTime = currentTime;
    }
    
    // Check if it's time to increase speed (every second)
    const timeSinceLastIncrease = (currentTime - lastSpeedIncreaseTime) / 1000; // Convert to seconds
    
    if (timeSinceLastIncrease >= speedIncreaseInterval) {
        baseRoadSpeed += speedIncreaseAmount;
        lastSpeedIncreaseTime = currentTime;
        console.log('Speed increased to:', baseRoadSpeed.toFixed(1));
    }
}

function animateBiker(deltaTime) {
    if (!bikerModel) return;
    
    // Calculate rotation speed based on road speed
    // Wheel circumference approximation: if road moves at speed X, wheels rotate proportionally
    const wheelRadius = 0.34; // Approximate wheel radius in meters (typical bike wheel)
    const wheelCircumference = 2 * Math.PI * wheelRadius;
    const rotationsPerSecond = roadSpeed / wheelCircumference;
    const rotationSpeed = rotationsPerSecond * Math.PI * 2; // radians per second
    
    // Rotate all wheel components around their local Z-axis
    // Since all components are at the same position, they'll rotate together as one wheel
    frontWheelComponents.forEach((wheel) => {
        wheel.rotation.z -= rotationSpeed * deltaTime;
    });
    
    // If we have back wheel components, rotate them in the same direction
    backWheelComponents.forEach((wheel) => {
        wheel.rotation.z -= rotationSpeed * deltaTime;
    });
    
    // Animate pedaling angle for bobbing motion
    pedalingAngle += rotationSpeed * deltaTime;
    
    // Add subtle body bobbing motion
    // The rider bobs up and down as they push on the pedals
    // Frequency: 2 bobs per pedal revolution (once for each leg pushing down)
    const bobFrequency = 2;
    const bobAmplitude = 0.015; // 1.5cm vertical movement - subtle but visible
    const bobAngle = pedalingAngle * bobFrequency;
    
    // Apply bobbing to the entire biker model
    // Base Y position is 1, add the bobbing motion on top
    bikerModel.position.y = 1 + Math.sin(bobAngle) * bobAmplitude;
    
    // Optional: Add very subtle side-to-side sway for more realism
    // This simulates the natural body movement during pedaling
    const swayAmplitude = 0.008; // 8mm side-to-side movement
    const swayAngle = pedalingAngle * bobFrequency; // Same frequency as bobbing
    // Add sway to the user's manual X offset (from arrow keys)
    bikerModel.position.x = bikerXOffset + Math.sin(swayAngle) * swayAmplitude;
}

function loadBikerModel() {
    bikerModelLoaded = false; // Reset loading state
    const loader = new GLTFLoader();
    loader.load('models/cyclist_-_racing_position_-_free_3d_printable/scene.gltf', (gltf) => {
        const biker = gltf.scene;
        biker.scale.set(0.5, 0.5, 0.5);
        biker.position.set(0, 1, 6.75);
        
        // Rotate so the biker's back faces the camera (~y 180deg)
        biker.rotation.y = Math.PI / 2;
        biker.updateMatrixWorld(true); // Force matrix update
        
        bikerModel = biker;
        legComponents = [];
        frontWheelComponents = [];
        backWheelComponents = [];
                
        // Find wheel parent groups and split their meshes
        biker.traverse((child) => {
            // Check EXACT names from your GLTF
            const isWheelComponent = 
                child.name === 'Spokes_Spokes_0' || 
                child.name === 'Rims_Rims_0' || 
                child.name === 'Tyres_Tyres_0';
            
            if (child.isMesh && isWheelComponent) {
                                
                // Get the original geometry
                const originalGeometry = child.geometry;
                const positionAttribute = originalGeometry.attributes.position;
                
                if (!positionAttribute) {
                    console.warn(`⚠ No position attribute for ${child.name}`);
                    return;
                }
                                
                // Determine split axis and threshold
                const positions = positionAttribute.array;
                let minX = Infinity, maxX = -Infinity;
                
                for (let i = 0; i < positions.length; i += 3) {
                    const x = positions[i];
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                }
                                
                // The wheels are oriented along the X axis (bike length)
                const centerX = (minX + maxX) / 2;
                                
                // Create arrays to store vertex data for front and back wheels
                const frontVertices = [];
                const backVertices = [];
                
                // Get all attributes we need to copy
                const attributes = originalGeometry.attributes;
                const hasNormals = attributes.normal !== undefined;
                const hasColors = attributes.color !== undefined;
                const hasUVs = attributes.uv !== undefined;
                                
                // Get the index array if it exists
                const indexAttribute = originalGeometry.index;
                
                if (indexAttribute) {
                    const indices = indexAttribute.array;
                    
                    for (let i = 0; i < indices.length; i += 3) {
                        const i0 = indices[i];
                        const i1 = indices[i + 1];
                        const i2 = indices[i + 2];
                        
                        // Get triangle vertices' X positions
                        const x0 = positions[i0 * 3];
                        const x1 = positions[i1 * 3];
                        const x2 = positions[i2 * 3];
                        
                        // Calculate triangle center X
                        const triangleCenterX = (x0 + x1 + x2) / 3;
                        
                        // Collect all vertex data for this triangle
                        const triangleData = [];
                        for (let vi = 0; vi < 3; vi++) {
                            const idx = indices[i + vi];
                            const vertexData = {
                                position: [
                                    positions[idx * 3],
                                    positions[idx * 3 + 1],
                                    positions[idx * 3 + 2]
                                ]
                            };
                            
                            if (hasNormals) {
                                const normals = attributes.normal.array;
                                vertexData.normal = [
                                    normals[idx * 3],
                                    normals[idx * 3 + 1],
                                    normals[idx * 3 + 2]
                                ];
                            }
                            
                            if (hasColors) {
                                const colors = attributes.color.array;
                                const itemSize = attributes.color.itemSize;
                                vertexData.color = [];
                                for (let c = 0; c < itemSize; c++) {
                                    vertexData.color.push(colors[idx * itemSize + c]);
                                }
                            }
                            
                            if (hasUVs) {
                                const uvs = attributes.uv.array;
                                vertexData.uv = [
                                    uvs[idx * 2],
                                    uvs[idx * 2 + 1]
                                ];
                            }
                            
                            triangleData.push(vertexData);
                        }
                        
                        // Assign triangle to front or back wheel
                        if (triangleCenterX > centerX) {
                            frontVertices.push(...triangleData);
                        } else {
                            backVertices.push(...triangleData);
                        }
                    }
                } else {
                    const vertexCount = positions.length / 3;
                    
                    for (let i = 0; i < vertexCount; i += 3) {
                        // Get triangle center X
                        const x0 = positions[i * 3];
                        const x1 = positions[(i + 1) * 3];
                        const x2 = positions[(i + 2) * 3];
                        const triangleCenterX = (x0 + x1 + x2) / 3;
                        
                        // Collect vertex data for this triangle
                        const triangleData = [];
                        for (let vi = 0; vi < 3; vi++) {
                            const idx = i + vi;
                            const vertexData = {
                                position: [
                                    positions[idx * 3],
                                    positions[idx * 3 + 1],
                                    positions[idx * 3 + 2]
                                ]
                            };
                            
                            if (hasNormals) {
                                const normals = attributes.normal.array;
                                vertexData.normal = [
                                    normals[idx * 3],
                                    normals[idx * 3 + 1],
                                    normals[idx * 3 + 2]
                                ];
                            }
                            
                            if (hasColors) {
                                const colors = attributes.color.array;
                                const itemSize = attributes.color.itemSize;
                                vertexData.color = [];
                                for (let c = 0; c < itemSize; c++) {
                                    vertexData.color.push(colors[idx * itemSize + c]);
                                }
                            }
                            
                            if (hasUVs) {
                                const uvs = attributes.uv.array;
                                vertexData.uv = [
                                    uvs[idx * 2],
                                    uvs[idx * 2 + 1]
                                ];
                            }
                            
                            triangleData.push(vertexData);
                        }
                        
                        // Assign to front or back
                        if (triangleCenterX > centerX) {
                            frontVertices.push(...triangleData);
                        } else {
                            backVertices.push(...triangleData);
                        }
                    }
                }
                
                
                if (frontVertices.length === 0 || backVertices.length === 0) {
                    console.error(`⚠ Split failed! One side has no vertices.`);
                    return;
                }
                
                // Calculate actual center of each wheel based on assigned vertices
                let frontSumX = 0, frontSumY = 0, frontSumZ = 0;
                let backSumX = 0, backSumY = 0, backSumZ = 0;
                
                frontVertices.forEach(v => {
                    frontSumX += v.position[0];
                    frontSumY += v.position[1];
                    frontSumZ += v.position[2];
                });
                
                backVertices.forEach(v => {
                    backSumX += v.position[0];
                    backSumY += v.position[1];
                    backSumZ += v.position[2];
                });
                
                const frontWheelCenterX = frontSumX / frontVertices.length;
                const frontWheelCenterY = frontSumY / frontVertices.length;
                const frontWheelCenterZ = frontSumZ / frontVertices.length;
                
                const backWheelCenterX = backSumX / backVertices.length;
                const backWheelCenterY = backSumY / backVertices.length;
                const backWheelCenterZ = backSumZ / backVertices.length;
                                
                // Helper function to create geometry from vertex data
                function createGeometryFromVertices(vertices) {
                    if (vertices.length === 0) return null;
                    
                    const geo = new THREE.BufferGeometry();
                    const posArray = [];
                    const normalArray = [];
                    const colorArray = [];
                    const uvArray = [];
                    
                    vertices.forEach(v => {
                        posArray.push(...v.position);
                        if (v.normal) normalArray.push(...v.normal);
                        if (v.color) colorArray.push(...v.color);
                        if (v.uv) uvArray.push(...v.uv);
                    });
                    
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
                    if (normalArray.length > 0) {
                        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3));
                    }
                    if (colorArray.length > 0) {
                        const colorItemSize = vertices[0].color.length;
                        geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, colorItemSize));
                    }
                    if (uvArray.length > 0) {
                        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
                    }
                    
                    geo.computeBoundingSphere();
                    if (normalArray.length === 0) {
                        geo.computeVertexNormals();
                    }
                    
                    return geo;
                }
                
                // Create new geometries
                const frontGeometry = createGeometryFromVertices(frontVertices);
                const backGeometry = createGeometryFromVertices(backVertices);
                
                if (!frontGeometry || !backGeometry) {
                    console.error(`⚠ Failed to create split geometries for ${child.name}`);
                    return;
                }
                                
                // Create new meshes with cloned materials
                const frontMesh = new THREE.Mesh(frontGeometry, child.material.clone());
                const backMesh = new THREE.Mesh(backGeometry, child.material.clone());
                
                // Copy shadow properties
                frontMesh.castShadow = child.castShadow;
                frontMesh.receiveShadow = child.receiveShadow;
                backMesh.castShadow = child.castShadow;
                backMesh.receiveShadow = child.receiveShadow;
                                
                // Create groups as pivot points at each wheel's center
                const frontWheelGroup = new THREE.Group();
                const backWheelGroup = new THREE.Group();
                
                frontWheelGroup.name = `Front_${child.name}`;
                backWheelGroup.name = `Back_${child.name}`;
                
                // Position groups at wheel centers (in parent's local space)
                frontWheelGroup.position.copy(child.position);
                frontWheelGroup.position.x += frontWheelCenterX;
                frontWheelGroup.position.y += frontWheelCenterY;
                frontWheelGroup.position.z += frontWheelCenterZ;
                frontWheelGroup.rotation.copy(child.rotation);
                frontWheelGroup.scale.copy(child.scale);
                
                backWheelGroup.position.copy(child.position);
                backWheelGroup.position.x += backWheelCenterX;
                backWheelGroup.position.y += backWheelCenterY;
                backWheelGroup.position.z += backWheelCenterZ;
                backWheelGroup.rotation.copy(child.rotation);
                backWheelGroup.scale.copy(child.scale);
                
                // Offset meshes to rotate around group origin
                frontMesh.position.x = -frontWheelCenterX;
                frontMesh.position.y = -frontWheelCenterY;
                frontMesh.position.z = -frontWheelCenterZ;
                
                backMesh.position.x = -backWheelCenterX;
                backMesh.position.y = -backWheelCenterY;
                backMesh.position.z = -backWheelCenterZ;
                
                // Add meshes to groups
                frontWheelGroup.add(frontMesh);
                backWheelGroup.add(backMesh);
                
                // Add groups to the same parent as the original mesh
                child.parent.add(frontWheelGroup);
                child.parent.add(backWheelGroup);
                
                // Store references to the groups
                frontWheelComponents.push(frontWheelGroup);
                backWheelComponents.push(backWheelGroup);
                
                // Remove the original mesh
                child.parent.remove(child);
            }
            
            if (child.name === 'Cyclist_1020_rider_dec_Cyclist_1020_rider_dec_0') {
                console.log('Found and removing ground patch:', child.name);
                child.visible = false; // Hide it
            }
        });
        
        scene.add(biker);
        bikerModelLoaded = true;
        checkAllModelsLoaded();
    });
}

function checkAllModelsLoaded() {
    // Check if all models are loaded
    if (bikerModelLoaded && conesLoaded >= conesToLoad && conesToLoad > 0) {
        // Hide loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        console.log('All models loaded!');
    }
}

function handleKeyPress(event) {
    // Prevent default behavior for arrow keys (prevents page scrolling)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
    }
    
    // Only add the key if it's not already in the array (prevents duplicates from key repeat)
    if (!keysPressed.includes(event.key)) {
        keysPressed.push(event.key);
    }
}

function handleKeyRelease(event) {
    // Prevent default behavior for arrow keys
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
    }
    
    // Remove the key from the array
    keysPressed = keysPressed.filter(key => key !== event.key);
}

function moveBiker(deltaTime) {
    if (!bikerModel) return; // Don't move if biker model hasn't loaded yet
    
    // Road boundaries: road is 8 units wide, so edges are at -4 and +4
    const roadLeftEdge = -4;
    const roadRightEdge = 4;
    
    // Movement speed in units per second (frame-rate independent)
    const moveSpeed = 4; // units per second

    // Update the offset instead of directly setting position (so sway animation can be added)
    if (keysPressed.includes('ArrowRight')) {
        bikerXOffset += moveSpeed * deltaTime;
        // Clamp to right edge
        if (bikerXOffset > roadRightEdge) {
            bikerXOffset = roadRightEdge;
        }
    }
    if (keysPressed.includes('ArrowLeft')) {
        bikerXOffset -= moveSpeed * deltaTime;
        // Clamp to left edge
        if (bikerXOffset < roadLeftEdge) {
            bikerXOffset = roadLeftEdge;
        }
    }
}

// Helper function to get random X position: -2, 0, or +2
function getRandomConeX() {
    const positions = [-2, 0, 2];
    return positions[Math.floor(Math.random() * positions.length)];
}

function createCone(x, z) {
    const loader = new GLTFLoader();
    loader.load('models/obstacle_conus/scene.gltf', (gltf) => {
        const cone = gltf.scene.clone(); // Use clone() so we can create multiple instances
        cone.scale.set(3, 3, 3);
        // Randomly place at -2, 0, or +2 on the road
        const sideX = x !== undefined ? x : getRandomConeX();
        const sideZ = z !== undefined ? z : -30;
        cone.position.set(sideX, 0.1, sideZ);
        scene.add(cone);
        cones.push(cone); // Add to cones array for movement tracking
        // Track if cone starts in front of biker (z > 6.75)
        const bikerZ = 6.75;
        coneWasInFront.set(cone, sideZ > bikerZ);
        
        // Mark cone as loaded
        conesLoaded++;
        checkAllModelsLoaded();
    }, undefined, (error) => {
        console.error('Error loading cone:', error);
        // Still increment to prevent infinite loading
        conesLoaded++;
        checkAllModelsLoaded();
    });
}

function generateObstacles() {
    let z = -30;
    conesToLoad = 5; // Set total number of cones to load
    conesLoaded = 0; // Reset loaded count

    for (let i = 0; i < 5; i++) {
        const x = getRandomConeX();
        createCone(x, z);
        z += 10;
    }
}

function trackPoints() {
    if (!bikerModel || cones.length === 0) return;
    
    // Get biker's Z position
    const bikerZ = bikerModel.position.z; // Biker is at z=6.75
    
    // Check each cone to see if biker has passed it
    cones.forEach((cone, index) => {
        // Skip if this cone has already been counted
        if (countedCones.has(cone)) return;
        
        const coneZ = cone.position.z;
        const wasInFront = coneWasInFront.get(cone);
        
        // Cones start behind biker (z < 6.75) and move forward (z increasing)
        // When cone passes biker: cone was BEHIND (z < bikerZ) and is now AHEAD (z > bikerZ)
        
        // Update tracking: if cone is now ahead of biker, mark it
        if (coneZ > bikerZ && !wasInFront) {
            // Cone just passed the biker!
            score += 1;
            countedCones.add(cone); // Mark this cone as counted
            coneWasInFront.set(cone, true); // Update tracking
            updateScoreDisplay();
            console.log('Point scored! Cone passed biker. Score:', score);
        }
    });
}

function updateScoreDisplay() {
    let scoreElement = document.getElementById('score-display');
    
    // If element doesn't exist, create it
    if (!scoreElement) {
        const controlsDiv = document.querySelector('.controls');
        if (controlsDiv) {
            scoreElement = document.createElement('div');
            scoreElement.id = 'score-display';
            scoreElement.style.cssText = 'padding: 10px 20px; font-size: 16px; font-family: Arial, sans-serif; color: #222; background-color: #ffd038; border: 2px solid #222; border-radius: 5px; font-weight: 600; display: flex; align-items: center;';
            controlsDiv.appendChild(scoreElement);
        } else {
            return;
        }
    }
    
    scoreElement.textContent = `Score: ${score}`;
}

function checkCollision() {
    if (!bikerModel || gameOver || cones.length === 0) return;
    
    // Get biker's world position (accounting for any transformations)
    bikerModel.updateMatrixWorld(true);
    const bikerWorldPos = new THREE.Vector3();
    bikerModel.getWorldPosition(bikerWorldPos);
    
    // Collision detection - check X and Y distance when Z positions are close
    // Biker is at z=6.75, cones move toward camera (increasing z)
    const zTolerance = 2.0; // How close in Z before checking X/Y collision
    const xCollisionRadius = 1.0; // X distance threshold
    const yCollisionRadius = 1.5; // Y distance threshold (biker is higher)
    
    // Check collision with each cone
    cones.forEach((cone, index) => {
        // Get cone's world position
        cone.updateMatrixWorld(true);
        const coneWorldPos = new THREE.Vector3();
        cone.getWorldPosition(coneWorldPos);
        
        // First check if cone is near biker's Z position
        const dz = Math.abs(bikerWorldPos.z - coneWorldPos.z);
        
        if (dz < zTolerance) {
            // Cone is close in Z, check X and Y
            const dx = Math.abs(bikerWorldPos.x - coneWorldPos.x);
            const dy = Math.abs(bikerWorldPos.y - coneWorldPos.y);
            
            // Debug: log when close
            if (dx < 2 || dy < 2) {
                console.log(`Near cone ${index}: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, dz=${dz.toFixed(2)}`);
            }
            
            // Check if collision in X and Y
            if (dx < xCollisionRadius && dy < yCollisionRadius) {
                console.log('COLLISION DETECTED!', { dx, dy, dz });
                endGame();
                return; // Exit early to prevent multiple calls
            }
        }
    });
}

function endGame() {
    if (gameOver) return; // Prevent multiple calls
    
    gameOver = true;
    isPaused = true;
    roadSpeed = 0;
    
    // Show game over message
    showGameOverScreen();
    
    console.log('Game Over! Final Score:', score);
}

function showGameOverScreen() {
    // Create or update game over overlay
    let gameOverDiv = document.getElementById('game-over-screen');
    
    if (!gameOverDiv) {
        gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'game-over-screen';
        gameOverDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 40px;
            border-radius: 10px;
            text-align: center;
            z-index: 2000;
            font-family: Arial, sans-serif;
        `;
        document.body.appendChild(gameOverDiv);
    }
    
    gameOverDiv.innerHTML = `
        <h2 style="margin: 0 0 20px 0; font-size: 32px;">Game Over!</h2>
        <p style="margin: 0 0 30px 0; font-size: 24px;">Final Score: ${score}</p>
        <button id="restart-button" style="
            padding: 15px 30px;
            font-size: 18px;
            background-color: #ffd038;
            color: #222;
            border: 2px solid #222;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
            font-family: Arial, sans-serif;
        ">Restart Game</button>
    `;
    
    // Add restart button event listener
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', resetGame);
    }
}

function resetGame() {
    // Reset game state
    gameOver = false;
    isPaused = false;
    score = 0;
    countedCones.clear();
    bikerXOffset = 0;
    baseRoadSpeed = 1; // Reset to starting speed
    roadSpeed = baseRoadSpeed;
    gameStartTime = 0; // Reset game start time
    lastSpeedIncreaseTime = 0; // Reset speed increase timer
    
    // Reset biker position
    if (bikerModel) {
        bikerModel.position.set(0, 1, 6.75);
    }
    
    // Reset all cones to initial positions
    let z = -30;
    const bikerZ = 6.75;
    cones.forEach((cone, index) => {
        const randomX = getRandomConeX();
        cone.position.set(randomX, 0.1, z);
        countedCones.delete(cone); // Reset counted status
        coneWasInFront.set(cone, z > bikerZ); // Reset tracking
        z += 10;
    });
    
    // Remove game over screen
    const gameOverDiv = document.getElementById('game-over-screen');
    if (gameOverDiv) {
        gameOverDiv.remove();
    }
    
    // Update score display
    updateScoreDisplay();
    
    console.log('Game reset!');
}

function setupRenderer() {
    const container = document.getElementById('game-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x6CA6CD, 1);
    container.appendChild(renderer.domElement);
    return renderer;
}

function handleResize() {
    const container = document.getElementById('game-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function init() {
    scene = createScene();
    camera = setupCamera();
    renderer = setupRenderer();
    setupLights();
    createGround();
    createGrassBlades();
    loadBikerModel();
    createRoad();
    generateObstacles();
    window.addEventListener('resize', handleResize);
    
    // Setup OrbitControls for camera rotation
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1, 0); // Look at the biker's position
    controls.update();
    
    // Setup pause/play buttons
    const playButton = document.getElementById('play-button');
    const pauseButton = document.getElementById('pause-button');
    
    if (playButton) {
        playButton.addEventListener('click', resumeGame);
    }
    
    if (pauseButton) {
        pauseButton.addEventListener('click', pauseGame);
    }
    
    // Setup keyboard input for biker movement
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('keyup', handleKeyRelease);
    
    // Initialize score display
    updateScoreDisplay();
}

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    // Calculate deltaTime for frame-rate independent movement
    let deltaTime = previousTime === 0 ? 0 : (currentTime - previousTime) / 1000; // Convert to seconds
    // Cap deltaTime to prevent large jumps (e.g., if tab was inactive)
    if (deltaTime > 0.1) {
        deltaTime = 0.1; // Cap at 100ms (10 FPS minimum)
    }
    previousTime = currentTime;
    
    // Determine road movement speed based on pause state
    determineRoadMovement();
    
    // Increase speed over time (every second)
    increaseSpeedOverTime(currentTime);
    
    // Animate biker (wheels and pedaling) - only if not paused and not game over
    if (!isPaused && !gameOver && deltaTime > 0) {
        animateBiker(deltaTime);
        moveBiker(deltaTime); // Check for keyboard input and move biker (frame-rate independent)
        trackPoints(); // Check if biker has passed any cones and update score
        checkCollision(); // Check for collisions with cones
    }
    
    // Move all road pieces toward the camera (only if game not over)
    // Increasing Z position moves them toward the camera (since camera looks at negative Z)
    if (roadPieces.length > 0 && deltaTime > 0 && !gameOver) {
        // Move all pieces
        roadPieces.forEach(piece => {
            piece.position.z += roadSpeed * deltaTime;
        });
        
        // Check for off-screen pieces and recycle them
        const offScreenPieces = roadPieces.filter(piece => piece.position.z > offScreenThreshold);
        
        if (offScreenPieces.length > 0) {
            // Find the minimum Z of all on-screen pieces
            const onScreenPieces = roadPieces.filter(piece => piece.position.z <= offScreenThreshold);
            
            let furthestZ;
            if (onScreenPieces.length > 0) {
                furthestZ = Math.min(...onScreenPieces.map(piece => piece.position.z));
            } else {
                // All pieces are off-screen - find the minimum of all pieces
                furthestZ = Math.min(...roadPieces.map(piece => piece.position.z));
                // If that's still off-screen, use a safe default
                if (furthestZ > offScreenThreshold) {
                    furthestZ = -100;
                }
            }
            
            // Move off-screen pieces to the front
            // Ensure they're placed well in front of the camera (negative Z values)
            const newZ = Math.min(furthestZ - roadPieceLength, -50);
            offScreenPieces.forEach(piece => {
                piece.position.z = newZ;
            });
        }
    }
    
    // Move all cones toward the camera at the same speed as the road (only if game not over)
    if (cones.length > 0 && deltaTime > 0 && !gameOver) {
        // Move all cones
        cones.forEach(cone => {
            cone.position.z += roadSpeed * deltaTime;
        });
        
        // Check for off-screen cones and recycle them
        const offScreenCones = cones.filter(cone => cone.position.z > offScreenThreshold);
        
        if (offScreenCones.length > 0) {
            // Find the minimum Z of all on-screen cones
            const onScreenCones = cones.filter(cone => cone.position.z <= offScreenThreshold);
            
            let furthestZ;
            if (onScreenCones.length > 0) {
                furthestZ = Math.min(...onScreenCones.map(cone => cone.position.z));
            } else {
                // All cones are off-screen - use initial position
                furthestZ = -30;
            }
            
            // Move off-screen cones back to the front with random X position
            const newZ = furthestZ - 10; // Place them slightly ahead of the furthest on-screen cone
            const bikerZ = 6.75;
            offScreenCones.forEach(cone => {
                // Randomly place at -2, 0, or +2 on the road
                const randomX = getRandomConeX();
                cone.position.set(randomX, 0.1, newZ);
                // Remove from counted cones so it can be counted again when passed
                countedCones.delete(cone);
                // Update tracking for recycled cone (mark if it starts in front)
                coneWasInFront.set(cone, newZ > bikerZ);
            });
        }
    }
    
    // Update controls (required if damping is enabled)
    controls.update();
    
    renderer.render(scene, camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        animate();
    });
} else {
    init();
    animate();
}