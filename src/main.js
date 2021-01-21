const config = require('./config')
const constants = require('./constants')
const AliveDB = require('./alivedb/src/alivedb')
const mongo = require('./mongo')
const indexer = require('./indexer')
const Express = require('express')
const CORS = require('cors')
const app = Express()

mongo.init()

app.use(CORS())

// Compatible with Avalon
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
        if (stream.ended) m3u8File += '\n#EXT-X-PLAYLIST-TYPE:VOD'
        m3u8File += '\n\n'

        for (let c = 0; c < stream.len.length; c++) {
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

indexer.loadState().then(() => indexer.buildIndex(() => mongo.write(indexer.processedBlocks,() => {
    indexer.stream()
    app.listen(config.http_port,() => console.log(`HAlive API server listening on port ${config.http_port}`))
})))