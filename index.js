
import { AxiDraw, DOWN, HOME, MOVE, START, STOP, polyline, UP } from "@thi.ng/axidraw"
import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Server } from 'socket.io'

const arrToGen = arr => {
    return (function* gen() {
        let i = 0
        while(i < arr.length) {
            yield arr[i]
            i++
        }
    })()
}

(async () => {
    const axi = new AxiDraw()
    await axi.connect("/dev/tty.usbmodem")
    await axi.penUp()

    let isPlotting = false

    const app = express()
    const server = createServer(app)
    const io = new Server(server)

    const __dirname = join(dirname(fileURLToPath(import.meta.url)), 'public/')

    app.get('/', (req, res) => res.sendFile(join(__dirname, 'index.html')));

    app.get( '/:name', (req, res) => res.sendFile(join(__dirname, req.params.name)))

    io.on('connection', socket => {
        console.log('user connected')

        socket.on('msg', async (msg) => {
            if(!isPlotting) {
                isPlotting = true
                // console.log('new plot:', msg)

                await axi.draw(arrToGen([
                    START,
                    ...msg.map(([a, b]) => [
                        MOVE(a, 1),
                        DOWN(),
                        MOVE(b, 2), 
                        UP(),
                    ]).flat(),
                    MOVE([0, 0], 1),
                    STOP,
                ]))

                isPlotting = false
                socket.emit('completed')
            }
        })
    })

    server.listen(3000, () => console.log('App running at http://localhost:3000'))
})()