console.log('v0.1')

const socket = io()
let isPlotting = false
socket.on('completed', () => {
    console.log('completed')
    isPlotting = false
})

let capture, pg
let threshold = .5
const penW = 1.8
const penH = 1.8
const NX = 50 // NB PIXEL X
const NY = 80 // NB PIXEL Y
const pixelSize = 10

const plotW = NX * penW
const plotH = NY * penH

console.log(`plotSize : ${plotW}x${plotH}mm`)

const nf2 = n => (n * 100|0)/100
const manDist = (a, b) => abs(a[0] - b[0]) + abs(a[1] - b[1])

function setup() {
    createCanvas(NX*pixelSize, NY*pixelSize)
    pixelDensity(1)
    pg = createGraphics(width, height)
    capture = createCapture(VIDEO)
    capture.hide()
}

function draw() {
    if(!isPlotting) {
        pg.imageMode(CENTER)

        pg.push()
        pg.scale(2)
        pg.translate(width, 0)
        pg.scale(-1, 1)
        pg.image(capture, width/2, height/2, height * capture.width / capture.height, height)
        pg.filter(THRESHOLD, threshold)
        pg.loadPixels()
        pg.pop()
        
        pg.push()
        pg.noStroke()
        pg.translate(-pixelSize/2, -pixelSize/2)
        for(let y = pixelSize/2; y < pg.height; y += pixelSize) {
            for(let x = pixelSize/2; x < pg.width; x += pixelSize) {
                let index = (y * pg.width + x)*4
                pg.fill(255 * pg.pixels[index])
                pg.rect(x, y, pixelSize, pixelSize)
            }
        }
        pg.pop()

        image(pg, 0, 0)
    }
}

function keyPressed() {
    if(!isPlotting) { // export svg
        isPlotting = true

        let w = width/pixelSize*penH
        let h = height/pixelSize*penH
        let s = `<svg viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" stroke="yellow" fill="none"/>`
        const paths = []
        let i = 0
        for(let y = pixelSize/2; y < pg.height; y += pixelSize) {
            let y1 = nf2((y - pixelSize/2)/pixelSize * penH + penH/2)
            let isLine = false
            let x1, x2

            if(i % 2 === 0) {
                for(let x = pixelSize/2; x < pg.width; x += pixelSize) {
                    let index = (y * pg.width + x) * 4
                    let d = 255 - pg.pixels[index] // black pixels are lines
                    if(d && !isLine) {
                        isLine = true
                        x1 = nf2((x - pixelSize/2)/pixelSize * penH + penW/2)
                    }
                    if(!d && isLine) {
                        isLine = false
                        x2 = nf2((x - pixelSize/2)/pixelSize * penH - penW/2)
                        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="black"/>`
                        paths.push([[x1, y1], [x2, y1]])
                    }
                }
                if(isLine) {
                    x2 = nf2(pg.width/pixelSize * penH - penW/2)
                    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="black"/>`
                    paths.push([[x1, y1], [x2, y1]])
                }
            }
            else {
                for(let x = pg.width - pixelSize/2; x > 0; x -= pixelSize) {
                    let index = (y * pg.width + x) * 4
                    let d = 255 - pg.pixels[index] // black pixels are lines
                    if(d && !isLine) {
                        isLine = true
                        x1 = nf2((x + pixelSize/2)/pixelSize * penH - penW/2)
                    }
                    if(!d && isLine) {
                        isLine = false
                        x2 = nf2((x + pixelSize/2)/pixelSize * penH + penW/2)
                        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="black"/>`
                        paths.push([[x1, y1], [x2, y1]])
                    }
                }
                if(isLine) {
                    x2 = nf2(penW/2)
                    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="black"/>`
                    paths.push([[x1, y1], [x2, y1]])
                }
            } 

            i++
        }
        s += `</svg>`
        if(key === 's') saveStrings([s], `plotomaton_${Date.now()}`, 'svg')
        console.log({paths})

        let points = paths.flat()
        console.log({points})

        const sortedPaths = []
        let currentPos = [0, 0], currentPath

        const getNextPt = pt => {
            let index, nextPt
            let minManDist = 10e5
            points.forEach((p, i) => {
                let d = manDist(p, pt)
                if(d < minManDist) {
                    minManDist = d
                    index = i
                    nextPt = [...p]
                }
            })
            points.splice(index, 1)
            return nextPt
        }

        const getNextPath = pt => {
            let index = paths.findIndex(p => (p[0][0] === pt[0] && p[0][1] == pt[1]) || (p[1][0] === pt[0] && p[1][1] == pt[1]))
            let nextPath = paths[index]
            paths.splice(index, 1)
            return nextPath
        }

        while(paths.length) {
            currentPos = getNextPt(currentPos)
            currentPath = getNextPath(currentPos)
            sortedPaths.push(currentPath)
            currentPos = currentPath[1 - currentPath.findIndex(p => p[0] === currentPos[0] && p[1] === currentPos[1])]
            points.splice(points.findIndex(p => p[0] === currentPos[0] && p[1] === currentPos[1]), 1)
        }

        console.log({sortedPaths})

        socket.emit('msg', sortedPaths)
    }
}

function mouseDragged() {
    threshold = mouseX/width
}