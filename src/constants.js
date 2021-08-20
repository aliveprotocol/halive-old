module.exports = {
    alivedb_pubkey_length: 87,
    custom_json_id: 'alive-test',
    max_chunk_bytes: 4200,
    max_chunks: 17280,
    op_codes: [
        0, // push stream
        1, // end stream
        2  // configure stream
    ],
    start_block: 0,
    supported_res: ['240','480','720','1080'],
}