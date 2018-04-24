import * as CryptoJS from 'crypto-js';
import {isBoolean} from 'util';

class Block {
    public index: number;
    public hash: string;
    public prevHash: string;
    public timestamp: number;
    public data: any[]; // sender, recipient and amount
    public listblockchain: any[] = [];
    public genesis: any[] = [];

    constructor(index: number = 0, hash: string = ' ', prevHash: string = ' ', timestamp: number = 0, data: string[] = []) {
        this.index     = index;
        this.hash      = hash;
        this.prevHash  = prevHash;
        this.timestamp = this.getCurrentTimestamp();
        this.data      = data;
        this.genesis.push(this.genesisBlock());
    }

    get  blockChain() {
        return this.listblockchain;
    }

    public createBlock = () => {
        let createdBlock;
        const prevBlock = this.getLastBlock();

        if ( prevBlock ) {
            this.prevHash = prevBlock.hash;
            this.index    = parseInt(this.getLastBlock().index + 1);
            this.hash     = this.calculateHash(this.index, this.prevHash, this.timestamp, this.data);
            createdBlock  = this.createBlocks(this.index, this.hash, this.prevHash, this.timestamp, this.data);

            if (this.validateBlock(createdBlock, prevBlock)) {
                this.listblockchain.push(createdBlock);
                // house keeping
                this.isValidChain(this.listblockchain, this.genesis);
            } else {
                return 'invalid block';
            }
        } else {
            // genesis Block
            this.genesis.push(this.genesisBlock());
        }

        return createdBlock;
    }

    public createBlocks = (index: number = 0, hash: string = ' ', prevHash: string = ' ', timestamp: number = 0, data: string[] = []) => {
        const create = {'index' : index,
                'hash': hash,
                'prevHash' : prevHash,
                'timestamp': timestamp,
                'data': data };
        return create;
    }

    public genesisBlock() {
        const basicBlock = {'index' : this.index,
            'hash': this.calculateHash(this.index, this.prevHash, this.timestamp, this.data),
            'prevHasd' : this.prevHash,
            'timestamp': this.timestamp,
            'data': this.data };
        this.index++;
        this.listblockchain.push(basicBlock);
        return basicBlock;
    }

    public validateBlock = (newBlock, prevBlock) => {
        if (parseInt(prevBlock.index + 1) !== parseInt(newBlock.index)) {
            console.log('invalid index');
            return false;
        } else if (prevBlock.hash !== newBlock.prevHash) {
            console.log('invalid previous hash');
            return false;
        } else if (this.hash !== newBlock.hash) {
            console.log('invalid hash');
            return false;
        }
        return true;
    }

    public isValidChain = (listblockchain, genesis) => {
        if (JSON.stringify(listblockchain[0]) !== JSON.stringify(genesis[0])) {
            return false;
        } else {
            const tempBlocks: any[] = [];

            tempBlocks.push(genesis[0]);
            for (let i = 1; i < listblockchain.length; i++) {
                if (this.validateBlock(listblockchain[i], tempBlocks[i - 1])) {
                    tempBlocks.push(listblockchain[i]);
                } else {
                    return false;
                }
            }
            return this.listblockchain = tempBlocks;
        }
    }

    public  getLastBlock() {
        return this.listblockchain[this.listblockchain.length - 1];
    }

    public getCurrentTimestamp = () => {
        return Math.round(new Date().getTime() / 1000);
    }

    public calculateHash = (index: number, prevHash: string, timestamp: number, data: string[])  => {
        return CryptoJS.SHA256(index + prevHash + timestamp + data).toString();
    }

}

export { Block };