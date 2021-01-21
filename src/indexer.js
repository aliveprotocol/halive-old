const constants = require('./constants')
const config = require('./config')
const validator = require('./alivedb/src/validator')
const axios = require('axios')
const parallel = require('run-parallel')
const reindex_output = 100000

let indexer = {
    headBlock: 0,
    processedBlocks: 0,
    mongoOps: [],
    blocks: [],
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
    processBlock: (block) => {
        if (!block)
            throw new Error('Cannnot process undefined block')

        // perform processing + validation
        // increment processed block
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
                    break
                case 1:
                    // end stream
                    break
                case 2:
                    // configure stream
                    break
                default:
                    break
            }
        }
    },
    buildIndex: async (blockNum,cb) => {
        let block = await indexer.batchLoadBlocks(blockNum)
        if (!block) {
            console.log('Finished indexing '+(blockNum-1)+' blocks')
            return cb()
        }
        if (blockNum % reindex_output === 0)
            console.log('INDEXED BLOCK ' + blockNum)
        indexer.processBlock(block)
        indexer.buildIndex(blockNum+1,cb)
    },
    writeIndex: (cb) => {
        let ops = []
        // perform mongo write ops
        parallel(ops,() => {
            cb()
        })
    },
    loadIndex: (cb) => {
        // load state from mongo upon startup
    },
    stream: () => {
        setInterval(() => {
            // Get head block
        },3000)

        setInterval(() => {
            // Process block live
        },1500)
    }
}

module.exports = indexer