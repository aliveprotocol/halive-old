const HAliveConfig = require('./config')
const constants = require('./constants')
const validator = require('./alivedb/src/validator')
const isIPFS = require('is-ipfs')
const cloneDeep = require('clone-deep')
const parallel = require('run-parallel')
const MongoClient = require('mongodb').MongoClient
const axios = require('axios')

let db

let mongo = {
    chunksCache: {},
    streamsCache: {},
    streamsChanges: {},
    init: (cb) => {
        MongoClient.connect(HAliveConfig.db_url,{useUnifiedTopology: true},(e,c) => {
            if (e) throw e
            console.log('Connected to MongoDB successfully')
        
            db = c.db(HAliveConfig.db_name)
            cb()
        })
    },
    getHeadState: () => new Promise((rs,rj) => {
        db.collection('state').findOne({_id:'headState'},(e,s) => {
            if (e) return rj(e)
            if (!s || !s.headBlock) return rs(0)
            rs(s.headBlock)
        })
    }),
    getStream: (streamer,link,cb) => {
        if (mongo.streamsCache[streamer+'/'+link])
            return cb(null,cloneDeep(mongo.streamsCache[streamer+'/'+link]))
        db.collection('streams').findOne({_id: streamer + '/' + link},(e,s) => {
            if (e) return cb(e)
            mongo.streamsCache[streamer+'/'+link] = s
            cb(null,cloneDeep(s))
        })
    },
    getStreamPromise: (streamer,link) => new Promise((rs,rj) => {
        mongo.getStream(streamer,link,(e,s) => {
            if (e) return rj(e)
            rs(s)
        })
    }),
    pushStream: async (streamer,link,data,ts) => {
        let existingStream = await mongo.getStreamPromise(streamer,link)
        if (!existingStream) {
            mongo.streamsCache[streamer+'/'+link] = {
                author: streamer,
                link: link,
                createdTs: ts,
                lastTs: ts,
                ended: false,
                src: [data.src]
            }

            for (let r in constants.supported_res) if (data[constants.supported_res[r]])
                mongo.streamsCache[streamer+'/'+link][constants.supported_res[r]] = [data[constants.supported_res[r]]]
        } else {
            mongo.streamsCache[streamer+'/'+link].src.push(data.src)
            for (let r in constants.supported_res) if (data[constants.supported_res[r]])
                mongo.streamsCache[streamer+'/'+link][constants.supported_res[r]].push(data[constants.supported_res[r]])

            mongo.streamsCache[streamer+'/'+link].lastTs = ts

            // Automatically end streams if limit is hit
            if (mongo.streamsCache[streamer+'/'+link].len.length + data.len.length >= constants.max_chunks)
                mongo.streamsCache[streamer+'/'+link].ended = true
        }
        mongo.streamsChanges[streamer+'/'+link] = 1
    },
    endStream: async (streamer,link) => {
        let existingStream = await mongo.getStreamPromise(streamer,link)
        if (existingStream && !existingStream.ended) {
            existingStream.ended = true
            mongo.streamsChanges[streamer+'/'+link] = 1
        }
    },
    configureStream: async (streamer,link,data,ts) => {
        let existingStream = await mongo.getStreamPromise(streamer,link)
        if (existingStream) {
            existingStream.pub = data.pub
            mongo.streamsChanges[streamer+'/'+link] = 1
        } else {
            mongo.streamsCache[streamer+'/'+link] = {
                author: streamer,
                link: link,
                pub: data.pub,
                createdTs: ts,
                lastTs: ts,
                ended: false
            }
            mongo.streamsChanges[streamer+'/'+link] = 1
        }
    },
    fetchChunk: (cid) => {
        return new Promise(async (rs,rj) => {
            let fetchurl = ''
            if (isIPFS.cid(cid))
                fetchurl = HAliveConfig.ipfs_gateway + '/ipfs/' + cid
            else if (validator.skylink(cid) === null)
                fetchurl = HAliveConfig.skynet_webportal + '/' + cid
            else
                return rj('invalid cid')
            if (mongo.chunksCache[cid])
                return rs(mongo.chunksCache[cid])
            try {
                let cached = await db.collection('chunks').findOne({_id: cid})
                if (cached && cached.data)
                    return rs(cached.data)
            } catch {}
            try {
                let head = (await axios.head(fetchurl, {timeout: HAliveConfig.chunk_fetch_timeout})).headers
                if (parseInt(head['content-length']) > constants.max_chunk_bytes)
                    return rj('chunk too large')
                if (head['content-type'] !== 'text/csv')
                    return rj('content type is not text/csv')
                let data = (await axios.get(fetchurl, {timeout: HAliveConfig.chunk_fetch_timeout})).data
                let lines = data.split('\n')
                for (let i in lines) {
                    lines[i] = lines[i].split(',')
                    lines[i][1] = parseFloat(lines[i][1])
                }
                lines = mongo.filterChunk(lines)
                mongo.chunksCache[cid] = lines
                db.collection('chunks').insertOne({ _id: cid, data: lines }, () => {})
                rs(lines)
            } catch {
                rj('failed to fetch chunk data')
            }
        })
    },
    filterChunk: (chunk = []) => {
        if (!Array.isArray(chunk))
            return []
        return chunk.filter((val) => {
            if (!Array.isArray(val))
                return false
            if (val.length !== 2)
                return false
            if (!isIPFS.cid(val[0]) && validator.skylink(val[0]) !== null)
                return false
            if (typeof val[1] !== 'number')
                return false
            return true
        })
    },
    write: (head,cb) => {
        let ops = []
        for (let i in mongo.streamsCache) if (mongo.streamsChanges[i]) {
            delete mongo.streamsChanges[i]
            ops.push((cb) => db.collection('streams').updateOne({
                _id: mongo.streamsCache[i].author + '/' + mongo.streamsCache[i].link
            }, { $set: mongo.streamsCache[i] }, { upsert: true },() => cb(null,true)))
        }
        ops.push((cb) => db.collection('state').updateOne({ _id: 'headState' }, { $set: { headBlock: head } },{ upsert: true },() => cb(null,true)))
        parallel(ops,() => cb(ops.length-1))
    }
}

module.exports = mongo