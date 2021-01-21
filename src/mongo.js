const HAliveConfig = require('./config')
const MongoClient = require('mongodb').MongoClient

let db

let mongo = {
    init: () => {
        MongoClient.connect(HAliveConfig.db_url,{useUnifiedTopology: true},(e,c) => {
            if (e) throw e
            console.log('Connected to MongoDB successfully')
        
            db = c.db(HAliveConfig.db_name)
        })
    },
    getStream: (streamer,link,cb) => {
        db.collection('streams').findOne({_id: streamer + '/' + link},cb)
    }
}

module.exports = mongo