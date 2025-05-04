const canvas = document.getElementById('tetris');
if (!canvas) {
    console.error('Canvas element not found!');
    throw new Error('Canvas element not found');
}

const context = canvas.getContext('2d');
if (!context) {
    console.error('Could not get 2D context!');
    throw new Error('Could not get 2D context');
}

// Set canvas size and scale
canvas.width = 300;
canvas.height = 600;
context.scale(30, 30);

const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');

const COLORS = [
    null,
    '#FF0D72', // I
    '#0DC2FF', // J
    '#0DFF72', // L
    '#F538FF', // O
    '#FF8E0D', // S
    '#FFE138', // T
    '#3877FF'  // Z
];

const PIECES = [
    null,
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
    [[2, 0, 0], [2, 2, 2], [0, 0, 0]],                         // J
    [[0, 0, 3], [3, 3, 3], [0, 0, 0]],                         // L
    [[0, 4, 4], [0, 4, 4], [0, 0, 0]],                         // O
    [[0, 5, 5], [5, 5, 0], [0, 0, 0]],                         // S
    [[0, 6, 0], [6, 6, 6], [0, 0, 0]],                         // T
    [[7, 7, 0], [0, 7, 7], [0, 0, 0]]                          // Z
];

let score = 0;
let level = 1;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let gameOver = false;
let isPaused = false;

// Create a 10x20 grid (standard Tetris dimensions)
const arena = createMatrix(10, 20);
const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0
};

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function createPiece(type) {
    if (type < 1 || type > 7) {
        console.error('Invalid piece type:', type);
        return PIECES[1]; // Default to I piece if invalid
    }
    return JSON.parse(JSON.stringify(PIECES[type])); // Create a deep copy of the piece
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                context.fillStyle = COLORS[value];
                context.fillRect(x + offset.x, y + offset.y, 1, 1);
                context.strokeStyle = '#000';
                context.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

// Add debug grid
function drawDebugGrid() {
    context.strokeStyle = '#333';
    context.lineWidth = 0.1;
    
    // Vertical lines
    for (let x = 0; x <= 12; x++) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 30);
        context.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y <= 30; y++) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(12, y);
        context.stroke();
    }
}

function draw() {
    console.log('Drawing frame');
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width / 30, canvas.height / 30);
    
    drawDebugGrid();
    
    // Draw the visible grid (10x20)
    drawMatrix(arena, {x: 0, y: 0});
    drawMatrix(player.matrix, player.pos);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // Ensure we're not trying to place outside the arena
                if (y + player.pos.y < arena.length && 
                    x + player.pos.x >= 0 && 
                    x + player.pos.x < arena[0].length) {
                    arena[y + player.pos.y][x + player.pos.x] = value;
                }
            }
        });
    });
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerMove(dir) {
    const newX = player.pos.x + dir;
    
    // Get the actual width and left offset of the piece
    let pieceWidth = 0;
    let leftOffset = player.matrix[0].length;
    for (let y = 0; y < player.matrix.length; y++) {
        for (let x = 0; x < player.matrix[y].length; x++) {
            if (player.matrix[y][x] !== 0) {
                pieceWidth = Math.max(pieceWidth, x + 1);
                leftOffset = Math.min(leftOffset, x);
            }
        }
    }
    
    // Adjust the new position based on the left offset
    const adjustedNewX = newX + leftOffset;
    
    // Check if the new position would be valid
    if (adjustedNewX >= 0 && newX + pieceWidth <= arena[0].length) {
        const originalX = player.pos.x;
        player.pos.x = newX;
        if (collide(arena, player)) {
            player.pos.x = originalX;
            return;
        }
    }
}

function playerRotate(dir) {
    const originalMatrix = JSON.parse(JSON.stringify(player.matrix));
    const originalX = player.pos.x;
    let offset = 1;
    
    rotate(player.matrix, dir);
    
    // Get the left offset after rotation
    let leftOffset = player.matrix[0].length;
    for (let y = 0; y < player.matrix.length; y++) {
        for (let x = 0; x < player.matrix[y].length; x++) {
            if (player.matrix[y][x] !== 0) {
                leftOffset = Math.min(leftOffset, x);
            }
        }
    }
    
    // Adjust position based on left offset
    player.pos.x -= leftOffset;
    
    // Check if rotation would put piece outside grid
    while (player.pos.x < 0 || 
           player.pos.x + player.matrix[0].length > arena[0].length ||
           collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            // If we can't find a valid position, revert the rotation
            player.matrix = originalMatrix;
            player.pos.x = originalX;
            return;
        }
    }
}

function rotate(matrix, dir) {
    // Transpose the matrix
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [
                matrix[x][y],
                matrix[y][x],
            ] = [
                matrix[y][x],
                matrix[x][y],
            ];
        }
    }
    
    // Reverse each row for clockwise rotation
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        // Reverse the matrix for counter-clockwise rotation
        matrix.reverse();
    }
}

function playerReset() {
    const pieces = [1, 2, 3, 4, 5, 6, 7];
    const randomIndex = Math.floor(Math.random() * pieces.length);
    const pieceType = pieces[randomIndex];
    player.matrix = createPiece(pieceType);
    player.pos.y = 0;
    // Center the piece in the 10-column grid, ensuring it's not too far left
    player.pos.x = Math.max(0, Math.floor(10 / 2) - Math.floor(player.matrix[0].length / 2));
    if (collide(arena, player)) {
        gameOver = true;
    }
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0) {
                // Check if the position is out of bounds
                if (y + o.y >= arena.length || 
                    x + o.x < 0 || 
                    x + o.x >= arena[0].length || 
                    (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function arenaSweep() {
    console.log('Starting arena sweep...');
    let rowCount = 1;
    let linesCleared = 0;
    
    for (let y = arena.length - 1; y >= 0; --y) {
        console.log(`Checking row ${y}...`);
        let rowFilled = true;
        
        // Check if the row is completely filled
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                rowFilled = false;
                break;
            }
        }
        
        // If the row is filled, remove it and add a new empty row at the top
        if (rowFilled) {
            console.log(`Row ${y} is filled! Clearing...`);
            const row = arena.splice(y, 1)[0];
            arena.unshift(new Array(row.length).fill(0));
            ++y; // Check the same row again since we moved everything down
            linesCleared++;
            console.log(`Lines cleared so far: ${linesCleared}`);
        }
    }
    
    // Update score based on lines cleared
    if (linesCleared > 0) {
        console.log(`Total lines cleared: ${linesCleared}`);
        // Base score for each line
        score += linesCleared * 100;
        
        // Add bonus for multiple lines
        switch (linesCleared) {
            case 2:
                score += 100; // 100 point bonus for 2 lines
                break;
            case 3:
                score += 200; // 200 point bonus for 3 lines
                break;
            case 4:
                score += 400; // 400 point bonus for 4 lines
                break;
        }
        
        // Level progression
        rowCount *= 2;
    }
    
    console.log('Arena sweep complete');
}

function updateScore() {
    scoreElement.textContent = score;
    level = Math.floor(score / 1000) + 1;
    levelElement.textContent = level;
    dropInterval = 1000 - (level * 100);
    if (dropInterval < 100) dropInterval = 100;
}

function update(time = 0) {
    if (gameOver || isPaused) {
        console.log('Game paused or over');
        return;
    }
    
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    
    console.log('Update called, dropCounter:', dropCounter, 'dropInterval:', dropInterval);
    
    if (dropCounter > dropInterval) {
        console.log('Dropping piece');
        playerDrop();
        dropCounter = 0;
    }
    
    draw();
    requestAnimationFrame(update);
}

function startGame() {
    arena.forEach(row => row.fill(0));
    score = 0;
    level = 1;
    gameOver = false;
    isPaused = false;
    scoreElement.textContent = '0';
    levelElement.textContent = '1';
    lastTime = 0;
    dropCounter = 0;
    playerReset();
    update();
}

function togglePause() {
    isPaused = !isPaused;
    if (!isPaused && !gameOver) {
        update();
    }
}

// Touch controls for mobile
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    e.preventDefault();
});

canvas.addEventListener('touchmove', e => {
    if (!touchStartX || !touchStartY) return;
    
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
            playerMove(-1);
        } else {
            playerMove(1);
        }
    } else {
        if (diffY > 0) {
            playerDrop();
        } else {
            playerRotate(1);
        }
    }
    
    touchStartX = 0;
    touchStartY = 0;
    e.preventDefault();
});

// Keyboard controls
function hardDrop() {
    if (gameOver || isPaused) return;
    
    // Store current position
    const originalPos = { ...player.pos };
    
    // Drop the piece to the bottom
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--; // Move back one step
    
    // Place the piece in the arena
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                const arenaY = y + player.pos.y;
                const arenaX = x + player.pos.x;
                if (arenaY >= 0 && arenaY < arena.length && 
                    arenaX >= 0 && arenaX < arena[0].length) {
                    arena[arenaY][arenaX] = value;
                }
            }
        });
    });
    
    // Create a new piece
    const pieces = [1, 2, 3, 4, 5, 6, 7];
    const randomIndex = Math.floor(Math.random() * pieces.length);
    const pieceType = pieces[randomIndex];
    player.matrix = createPiece(pieceType);
    player.pos.y = 0;
    player.pos.x = Math.floor(arena[0].length / 2) - Math.floor(player.matrix[0].length / 2);
    
    // Check for completed lines and update score
    arenaSweep();
    updateScore();
    
    // Check if game over
    if (collide(arena, player)) {
        gameOver = true;
        return;
    }
    
    // Continue the game
    dropCounter = 0;
}

document.addEventListener('keydown', event => {
    if (gameOver) return;
    
    // Prevent space from triggering button clicks
    if (event.keyCode === 32) {
        event.preventDefault();
    }
    
    switch (event.keyCode) {
        case 37: // left arrow
            playerMove(-1);
            break;
        case 39: // right arrow
            playerMove(1);
            break;
        case 40: // down arrow
            playerDrop();
            break;
        case 38: // up arrow
            playerRotate(-1); // anticlockwise
            break;
        case 90: // Z key
            playerRotate(-1); // anticlockwise
            break;
        case 88: // X key
            playerRotate(1); // clockwise
            break;
        case 32: // space
            hardDrop();
            break;
    }
});

// Add blur to buttons when clicked to prevent space from triggering them
startButton.addEventListener('click', () => {
    startButton.blur();
    startGame();
});

pauseButton.addEventListener('click', () => {
    pauseButton.blur();
    togglePause();
});

// Mobile controls
const rotateLeftBtn = document.getElementById('rotate-left');
const rotateRightBtn = document.getElementById('rotate-right');
const moveLeftBtn = document.getElementById('move-left');
const moveRightBtn = document.getElementById('move-right');
const softDropBtn = document.getElementById('soft-drop');
const hardDropBtn = document.getElementById('hard-drop');

// Add touch event listeners for mobile controls
rotateLeftBtn.addEventListener('touchstart', () => playerRotate(-1));
rotateRightBtn.addEventListener('touchstart', () => playerRotate(1));
moveLeftBtn.addEventListener('touchstart', () => playerMove(-1));
moveRightBtn.addEventListener('touchstart', () => playerMove(1));
softDropBtn.addEventListener('touchstart', () => playerDrop());
hardDropBtn.addEventListener('touchstart', () => hardDrop());

// Prevent default touch behaviors
document.querySelectorAll('.mobile-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
    });
}); 