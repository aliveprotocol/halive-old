const constants = require('./constants')
const config = require('./config')
const validator = require('./alivedb/src/validator')
const mongo = require('./mongo')
const isIPFS = require('is-ipfs')
const axios = require('axios')
const reindex_output = 100000

let indexer = {
    headBlock: 0,
    processedBlocks: 0,
    fetchingBlock: false,
    blocks: [],
    lastIndexOut: new Date().getTime(),
    batchLoadBlocks: (start) => new Promise((rs,rj) => {
        if (indexer.blocks.length == 0)
            axios.post(config.rpc_node,{
                id: 1,
                jsonrpc: '2.0',
                method: 'block_api.get_block_range',
                params: { starting_block_num: start, count: 1000 }
            }).then((r) => {
                if (r.data.error) return rj(r.data.error)
                indexer.blocks = r.data.result.blocks
                rs(indexer.blocks.shift())
            })
        else
            rs(indexer.blocks.shift())
    }),
    processBlock: async (block) => {
        if (!block)
            throw new Error('Cannnot process undefined block')

        // perform processing + validation
        // increment processed block
        let blockTs = new Date(block.timestamp).getTime()
        let streamsToProcess = []
        for (let i in block.transactions) for (let j in block.transactions[i].operations)
            if (block.transactions[i].operations[j].type === 'custom_json_operation' &&
                block.transactions[i].operations[j].value.id === constants.custom_json_id) {
            streamsToProcess.push(block.transactions[i].operations[j].value)
        }

        for (let s in streamsToProcess) {
            let json
            try {
                json = JSON.parse(streamsToProcess[s].json)
            } catch {
                continue
            }
            if (!json.op || typeof json.op !== 'number' || !constants.op_codes.includes(json.op))
                continue
            if (!json.link || validator.link(json.link) !== null)
                continue
            switch (json.op) {
                case 0:
                    // push stream
                    if (!json.len || Array.isArray(json.len)) break
                    if (!json.src || Array.isArray(json.src) || json.src.length !== json.len.length) break
                    for (let d in json.len)
                        if (typeof json.len[d] !== 'number') break
                    for (let h in json.src)
                        if (!isIPFS.cid(json.src[h]) && validator.skylink(json.src[h]) !== null) break
                    for (let r in constants.supported_res) {
                        if (json[constants.supported_res[r]] && (Array.isArray(json[constants.supported_res[r]] || json[constants.supported_res[r]].length !== json.len.length))) break
                        for (let h in json[constants.supported_res[r]])
                            if (!isIPFS.cid(json[constants.supported_res[r]][h]) && validator.skylink(json[constants.supported_res[r]]) !== null) break
                    }
                    let stream = await mongo.getStreamPromise(streamsToProcess[s].required_posting_auths[0],json.link)
                    if (stream) {
                        if (stream.ended) break
                        for (let r in constants.supported_res)
                            if (stream[constants.supported_res[r]] && !json[constants.supported_res[r]] ||
                                !stream[constants.supported_res[r]] && json[constants.supported_res[r]]) break
                    }
                    await mongo.pushStream(streamsToProcess[s].required_posting_auths[0],json.link,json,blockTs)
                    break
                case 1:
                    // end stream
                    await mongo.endStream(streamsToProcess[s].required_posting_auths[0],json.link)
                    break
                case 2:
                    // configure stream
                    if (!json.pub || typeof json.pub !== 'string' || json.pub.length !== constants.alivedb_pubkey_length) break
                    await mongo.configureStream(streamsToProcess[s].required_posting_auths[0],json.link,json,blockTs)
                    break
                default:
                    break
            }
        }
        indexer.processedBlocks++
    },
    buildIndex: async (cb) => {
        let block = await indexer.batchLoadBlocks(indexer.processedBlocks+1)
        if (!block) {
            console.log('Finished indexing '+(indexer.processedBlocks)+' blocks')
            return cb()
        }
        await indexer.processBlock(block)
        if (indexer.processedBlocks % reindex_output === 0) {
            console.log('INDEXED BLOCK #' + indexer.processedBlocks + ' (' + ((new Date().getTime()-indexer.lastIndexOut)/reindex_output) + 'b/s)')
        }
        indexer.buildIndex(cb)
    },
    loadState: async () => {
        // load state from mongo upon startup
        indexer.processedBlocks = await mongo.getHeadState()
    },
    stream: () => {
        setInterval(() => {
            // Get head block
            axios.post(config.rpc_node,{
                id: 1,
                jsonrpc: '2.0',
                method: 'condenser_api.get_dynamic_global_properties',
                params: []
            }).then((props) => {
                indexer.headBlock = props.data.result.head_block_number
            }).catch(() => {})
        },3000)

        setInterval(() => {
            // Process block live
            if (indexer.processedBlocks < indexer.headBlock && !indexer.fetchingBlock) {
                indexer.fetchingBlock = true
                axios.post(config.rpc_node,{
                    id: 1,
                    jsonrpc: '2.0',
                    method: 'condenser_api.get_block',
                    params: [indexer.processedBlocks+1]
                }).then(async (newBlock) => {
                    let newBlock = newBlock.data.result
                    let startTime = new Date().getTime()
                    await indexer.processBlock(newBlock)
                    mongo.write(indexer.processedBlocks,(count) => {
                        console.log('Live processed block #'+indexer.processedBlocks+', updated '+count+' streams in '+(new Date().getTime() - startTime)+' ms')
                        setTimeout(() => indexer.fetchingBlock = false,200)
                    })
                }).catch(() => indexer.fetchingBlock = false)
            }
        },1500)
    }
}

module.exports = indexer