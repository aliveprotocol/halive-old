const config = require('./config')
const constants = require('./constants')
const AliveDB = require('./alivedb/src/alivedb')
const mongo = require('./mongo')
const indexer = require('./indexer')
const Express = require('express')
const CORS = require('cors')
const app = Express()

mongo.init(() => {
    indexer.loadState().then(() => indexer.buildIndex(() => mongo.write(indexer.processedBlocks,(count) => {
        console.log('written '+count+' streams to disk')
        indexer.stream()
        app.listen(config.http_port,() => console.log(`HAlive API server listening on port ${config.http_port}`))
    })))
})

app.use(CORS())

// Compatible with Avalon
app.get('/streaminfo/:author/:link',(req,res) => {
    if (!req.params.author || typeof req.params.link !== 'string')
        return res.status(400).send()
    mongo.getStream(req.params.author,req.params.link, async (err,stream) => {
        if (!stream) return res.status(404).send()
        if (stream.len) {
            stream.count = stream.len.length
            stream.len = stream.len.reduce((a,b) => a + b,0)
        }
        delete stream.src
        for (let i in config.streamRes) delete stream[config.streamRes[i]]
        if (stream.pub) {
            // Fetch more stream hashes from AliveDB if any
            let gunStreams = await AliveDB.getListFromUser(stream.pub,'hive/'+req.params.author+'/'+req.params.link,false,stream.lastTs)
            for (let s = 0; s < gunStreams.length; s++) {
                stream.len += gunStreams[s].len
                count++
            }
        }
        res.status(200).send(stream)
    })
})

app.get('/stream/:author/:link', (req,res) => {
    if (!req.params.author || typeof req.params.link !== 'string')
        return res.status(400).send()
    mongo.getStream(req.params.author, req.params.link, async (err,stream) => {
        if (err) return res.status(500).send()
        if (!stream) return res.status(404).send()
        let m3u8File = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0'
        let gw = req.query.gw || 'http://localhost:8080/ipfs/'
        let quality = req.query.quality || 'src'

        if (!stream[quality] || (quality !== 'src' && !constants.supported_res.includes(quality)))
            return res.status(404).send()

        // video on demand if livestream ended
        if (stream.ended)
            m3u8File += '\n#EXT-X-PLAYLIST-TYPE:VOD'
        else
            m3u8File += '\n#EXT-X-PLAYLIST-TYPE:EVENT'
        m3u8File += '\n\n'

        if (stream.len) for (let c = 0; c < stream.len.length; c++) {
            m3u8File += '#EXTINF:' + stream.len[c] + ',\n'
            m3u8File += gw + stream[quality][c] + '\n'
        }

        if (stream.ended)
            m3u8File += '#EXT-X-ENDLIST'
        else if (stream.pub) {
            // Fetch more stream hashes from AliveDB if any
            let gunStreams = await AliveDB.getListFromUser(stream.pub,'hive/'+req.params.author+'/'+req.params.link,false,stream.lastTs)
            for (let s = 0; s < gunStreams.length; s++) if (gunStreams[s][quality]) {
                m3u8File += '#EXTINF:' + gunStreams[s].len + ',\n'
                m3u8File += gw + gunStreams[s][quality] + '\n'
            }
        }

        res.setHeader('Content-Type', 'text/plain')
        res.status(200).send(m3u8File)
    })
})

// m3u8 master playlist
app.get('/stream/:author/:link/master', (req,res) => {
    if (!req.params.author || typeof req.params.link !== 'string')
        return res.status(400).send()
    mongo.getStream(req.params.author, req.params.link, async (err,stream) => {
        if (!stream) return res.status(404).send()
        let m3u8File = '#EXTM3U\n\n'
        let gw = req.query.gw || 'http://localhost:8080/ipfs/'

        for (let q in stream) {
            if (q === '240') {
                m3u8File += '#EXT-X-STREAM-INF:BANDWIDTH=350000,CODECS="mp4a.40.2, avc1.4d401f",RESOLUTION=427x240\n'
                m3u8File += req.params.author + '/' + req.params.link + '?quality=240&gw=' + gw + '\n\n'
            } else if (q === '480') {
                m3u8File += '#EXT-X-STREAM-INF:BANDWIDTH=700000,CODECS="mp4a.40.2, avc1.4d401f",RESOLUTION=853x480\n'
                m3u8File += req.params.author + '/' + req.params.link + '?quality=480&gw=' + gw + '\n\n'
            } else if (q === '720') {
                m3u8File += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,CODECS="mp4a.40.2, avc1.4d401f",RESOLUTION=1280x720\n'
                m3u8File += req.params.author + '/' + req.params.link + '?quality=720&gw=' + gw + '\n\n'
            } else if (q === '1080') {
                m3u8File += '#EXT-X-STREAM-INF:BANDWIDTH=1600000,CODECS="mp4a.40.2, avc1.4d401f",RESOLUTION=1920x1080\n'
                m3u8File += req.params.author + '/' + req.params.link + '?quality=1080&gw=' + gw + '\n\n'
            } else if (q === 'src') {
                m3u8File += '#EXT-X-STREAM-INF:BANDWIDTH=1600000,CODECS="mp4a.40.2, avc1.4d401f",RESOLUTION=src\n'
                m3u8File += req.params.author + '/' + req.params.link + '?quality=src&gw=' + gw + '\n\n'
            }
        }

        res.setHeader('Content-Type', 'text/plain')
        res.status(200).send(m3u8File)
    })
})