let FORMAT = 'A6'
let ORIENTATION = 'PORTRAIT' // 'PORTRAIT' or 'LANDSCAPE'
const margin = 10 // margin around plot in mm
let penW = 1.6 // pen width in mm
let penH = 1.6 // pen height in mm

const socket = io()

let isPlotting = false
socket.on('completed', () => {
    console.log('completed')
    isPlotting = false
})

const nbFormat = (n, e = 2) => (n * (10 ** e)|0) / (10 ** e) // number format

const formats = {
    A3: {
        paperW: 297,
        paperH: 420
    },
    A4: {
        paperW: 210,
        paperH: 297
    },
    A5: {
        paperW: 297/2,
        paperH: 210
    },
    A6: {
        paperW: 210/2,
        paperH: 297/2
    }
}
let { paperW, paperH } = formats[FORMAT]
if(ORIENTATION === 'LANDSCAPE') [paperW, paperH] = [paperH, paperW]
let NX = (paperW - margin * 2) / penW | 0 // NB PIXEL X
let NY = (paperH - margin * 2) / penH | 0 // NB PIXEL Y
const pixelSize = 10
let plotW = nbFormat(NX * penW)
let plotH = nbFormat(NY * penH)
console.log({paperW, paperH, penW, penH, plotW, plotH, NX, NY})

let sortedPaths
let ccanvas, capture, pg
let threshold = .5

function setup() {
    let ccanvas = createCanvas(NX*pixelSize, NY*pixelSize)
    ccanvas.parent("cvsContainer")
    pixelDensity(1)
    document.querySelector('canvas').removeAttribute('style')
    pg = createGraphics(width, height)
    capture = createCapture(VIDEO)
    capture.hide()
}

function draw() {
    if(!isPlotting) {
        pg.push()
        pg.translate(width, 0)
        pg.scale(-1, 1)
        pg.imageMode(CENTER)
        pg.translate(width/2, height/2)
        pg.scale(1.75)
        pg.image(capture, 0, 0, height > width ? height * capture.width / capture.height : width, height > width ? height : width * capture.height / capture.width)
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

function computePaths() {
    let w = width / pixelSize * penW
    let h = height / pixelSize * penH
    const paths = []
    let i = 0
    for(let y = pixelSize/2; y < pg.height; y += pixelSize) {
        let y1 = nbFormat((y - pixelSize/2)/pixelSize * penH + penH/2)
        let isLine = false
        let x1, x2

        if(i % 2 === 0) {
            for(let x = pixelSize/2; x < pg.width; x += pixelSize) {
                let index = (y * pg.width + x) * 4
                let d = 255 - pg.pixels[index] // black pixels are lines
                if(d && !isLine) {
                    isLine = true
                    x1 = nbFormat((x - pixelSize/2)/pixelSize * penH + penW/2)
                }
                if(!d && isLine) {
                    isLine = false
                    x2 = nbFormat((x - pixelSize/2)/pixelSize * penH - penW/2)
                    paths.push([[x1, y1], [x2, y1]])
                }
            }
            if(isLine) {
                x2 = nbFormat(pg.width/pixelSize * penH - penW/2)
                paths.push([[x1, y1], [x2, y1]])
            }
        }
        else {
            for(let x = pg.width - pixelSize/2; x > 0; x -= pixelSize) {
                let index = (y * pg.width + x) * 4
                let d = 255 - pg.pixels[index] // black pixels are lines
                if(d && !isLine) {
                    isLine = true
                    x1 = nbFormat((x + pixelSize/2)/pixelSize * penH - penW/2)
                }
                if(!d && isLine) {
                    isLine = false
                    x2 = nbFormat((x + pixelSize/2)/pixelSize * penH + penW/2)
                    paths.push([[x1, y1], [x2, y1]])
                }
            }
            if(isLine) {
                x2 = nbFormat(penW/2)
                paths.push([[x1, y1], [x2, y1]])
            }
        } 

        i++
    }
    console.log({paths})

    let points = paths.flat()
    console.log({points})

    sortedPaths = []

    const getNextPt = pt => {
        let index, nextPt
        let minDist = 10e5
        points.forEach((p, i) => {
            let d = dist(...p, ...pt)
            if(d < minDist) {
                minDist = d
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

    let currentPos = [0, 0], currentPath
    while(paths.length) {
        currentPos = getNextPt(currentPos)
        currentPath = getNextPath(currentPos)
        sortedPaths.push(currentPath)
        currentPos = currentPath[1 - currentPath.findIndex(p => p[0] === currentPos[0] && p[1] === currentPos[1])]
        points.splice(points.findIndex(p => p[0] === currentPos[0] && p[1] === currentPos[1]), 1)
    }

    const marginX = (paperH - h) / 2
    const marginY = (paperW - w) / 2
    sortedPaths.forEach(([a, b]) => {
        if(ORIENTATION === 'PORTRAIT') {
            // rotate 90°
            a[0] = w - a[0]
            a = a.reverse()
            b[0] = w - b[0]
            b = b.reverse()
        }
        
        // center on paper
        a[0] += marginX
        a[1] += marginY
        b[0] += marginX
        b[1] += marginY
    })
}


/* -- */
const updateDimensions = () => {
    paperW = formats[FORMAT].paperW
    paperH = formats[FORMAT].paperH
    if(ORIENTATION === 'LANDSCAPE') [paperW, paperH] = [paperH, paperW]
    NX = (paperW - margin * 2) / penW | 0 // NB PIXEL X
    NY = (paperH - margin * 2) / penH | 0 // NB PIXEL Y
    plotW = nbFormat(NX * penW)
    plotH = nbFormat(NY * penH)
    console.log({paperW, paperH, penW, penH, plotW, plotH, NX, NY})
    resizeCanvas(NX*pixelSize, NY*pixelSize)
    document.querySelector('canvas').removeAttribute('style')
    pg = createGraphics(width, height)
}


const setRangeValue = (targetID, value) => {
    document.querySelector(`#${targetID}`).innerHTML = value;
}

const rangeThreshold = document.querySelector("#threshold")
setRangeValue("thresholdValue", threshold);
rangeThreshold.addEventListener("input", (e)=>{
    threshold = parseFloat(rangeThreshold.value)
    setRangeValue("thresholdValue", threshold)
    console.log(`threshold: ${threshold}`)
});

// print format
const printFormat = document.querySelector("#formats");
printFormat.addEventListener("change", (e)=>{
    FORMAT = printFormat.value;
    updateDimensions()
});

// print orientation
const printOrientation = document.querySelectorAll('input[name="orientation"]');
printOrientation.forEach((r,i)=>{
    r.addEventListener("click", (e)=>{
        ORIENTATION = r.value;
        updateDimensions()
    });
})

// pen X
// const rangePenX = document.querySelector("#penSizeX")
// setRangeValue("penSizeXValue", penW)
// rangePenX.addEventListener("change", (e) => {
//     setRangeValue("penSizeXValue", rangePenX.value)
//     penW = rangePenX.value
//     updateDimensions()
// });

// // pen Y
// const rangePenY = document.querySelector("#penSizeY")
// setRangeValue("penSizeYValue", penH)
// rangePenY.addEventListener("change", (e) => {
//     setRangeValue("penSizeYValue", rangePenY.value)
//     penH = rangePenY.value
//     updateDimensions()
// })

const SendToPrinter = document.querySelector("#SendToPrinter")
SendToPrinter.addEventListener("click", (e) => {
    if(isPlotting){return}
    isPlotting = true
    computePaths()
    socket.emit('plot', sortedPaths)
})

const ResendToPrinter = document.querySelector("#ResendToPrinter")
ResendToPrinter.addEventListener("click", (e) => {
    if(isPlotting){return}
    isPlotting = true
    socket.emit('plot', sortedPaths)
})

const SaveToSvg = document.querySelector("#SaveToSvg")
SaveToSvg.addEventListener("click", (e) => {
    computePaths()
    let w = ORIENTATION === 'PORTRAIT' ? paperH : paperW
    let h = ORIENTATION === 'PORTRAIT' ? paperW : paperH
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">\n<rect width="${w}" height="${h}" stroke="yellow" fill="none"/>\n${sortedPaths.map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="black" stroke-width="${penH}" stroke-linecap="project"/>`).join('\n')}\n</svg>`
    saveStrings([s], `plotomaton_${Date.now()}`, 'svg')
})

const ToggleFullscreen = document.querySelector("#ToggleFullscreen")
ToggleFullscreen.addEventListener("click", (e)=>{
    fullscreen(!fullscreen())
})

// function doubleClicked() {
//     fullscreen(!fullscreen())
// }

