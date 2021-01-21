const HAliveConfig = require('./config')
const constants = require('./constants')
const cloneDeep = require('clone-deep')
const parallel = require('run-parallel')
const MongoClient = require('mongodb').MongoClient

let db

let mongo = {
    streamsCache: {},
    streamsChanges: {},
    init: () => {
        MongoClient.connect(HAliveConfig.db_url,{useUnifiedTopology: true},(e,c) => {
            if (e) throw e
            console.log('Connected to MongoDB successfully')
        
            db = c.db(HAliveConfig.db_name)
        })
    },
    getHeadState: () => new Promise((rs,rj),() => {
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
                len: data.len,
                src: data.src
            }

            for (let r in constants.supported_res) if (data[constants.supported_res[r]])
                mongo.streamsCache[streamer+'/'+link][constants.supported_res[r]] = data[constants.supported_res[r]]
        } else {
            if (existingStream.len) {
                for (let i in data.len)
                    existingStream[streamer+'/'+link].len.push(data.len[i])
                for (let i in data.src)
                    existingStream[streamer+'/'+link].src.push(data.src[i])
                for (let r in constants.supported_res) if (data[constants.supported_res[r]]) for (let i in data[constants.supported_res[r]])
                    existingStream[streamer+'/'+link][constants.supported_res[r]].push(data[constants.supported_res[r]][i])
            } else {
                existingStream[streamer+'/'+link].len = data.len
                existingStream[streamer+'/'+link].src = data.src
                for (let r in constants.supported_res) if (data[constants.supported_res[r]])
                    existingStream[streamer+'/'+link][constants.supported_res[r]] = data[constants.supported_res[r]]
            }

            existingStream[streamer+'/'+link].lastTs = ts

            // Automatically end streams if limit is hit
            if (existingStream.len.length + data.len.length >= constants.max_chunks)
                existingStream[streamer+'/'+link].ended = true
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
    write: (head,cb) => {
        let ops = []
        for (let i in mongo.streamsCache) if (mongo.streamsChanges[i]) {
            delete mongo.streamsChanges[i]
            ops.push((cb) => db.collection('streams').updateOne({
                _id: mongo.streamsCache[i].author + '/' + mongo.streamsCache[i].link
            }, { $set: mongo.streamsCache[i] }, { upsert: true },() => cb(null,true)))
        }
        ops.push((cb) => db.collection('state').updateOne({ _id: 'headState' }, { $set: { headBlock: head } },{ upsert: true },() => cb(null,true)))
        parallel(ops,() => cb(ops.length))
    }
}

module.exports = mongo