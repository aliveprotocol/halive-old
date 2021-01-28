# HAlive

Alive streams indexer and API server for Hive. Indexes the Hive blockchain from a starting block number for Alive-related `custom_json` transactions and processes them in a MongoDB database.

This package provides a set of APIs that are cross-compatible with Alive APIs on Avalon. Also acts as an AliveDB relay peer.

## Pre-requisite

Besides `npm` and `nodejs`, MongoDB is required to store the index data. Installation guide can be found [here](https://docs.mongodb.com/manual/administration/install-community).

It is also recommended that you run your own [hived](https://gitlab.syncad.com/hive/hive) node. Hive RPC endpoints must have `block_api` and `condenser_api` enabled.

## Installation
```
git clone https://github.com/aliveprotocol/HAlive
cd HAlive
git submodule update --init --recursive
npm i
```

## Starting HAlive server
```
npm start
```

## Configuration

HAlive inherits some configuration with AliveDB and can be configured using command line args or env vars. Command line args takes precedence over env vars.

|Argument|Env Var|Description|Default|
|-|-|-|-|
|`--data_dir`|`ALIVEDB_DATA_DIR`|Directory for GunDB database|.radata|
|`--peers`|`ALIVEDB_PEERS`|List of bootstrap peers *(comma-seperated)*||
|`--gun_port`|`ALIVEDB_GUN_PORT`|Gun P2P port|3007|
|`--db_name`|`HALIVE_DB_NAME`|MongoDB database name|halive|
|`--db_url`|`HALIVE_DB_URL`|MongoDB database URL|mongodb://localhost:27017|
|`--http_port`|`HALIVE_HTTP_PORT`|HTTP port|3010|
|`--rpc_node`|`HALIVE_RPC_NODE`|Hive RPC node|https://techcoderx.com|