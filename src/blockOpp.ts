import * as CryptoJS from 'crypto-js';

class Block {
    public index: number;
    public hash: string;
    public prevHash: string;
    public timestamp: number;
    public data: any[]; // sender, recipient and amount
    public listblockchian: any[] = [];

    constructor(index: number = 0, hash: string = ' ', prevHash: string = ' ', timestamp: number = 0, data: string[] = []) {
        this.index     = index;
        this.hash      = hash;
        this.prevHash  = prevHash;
        this.timestamp = this.getCurrentTimestamp();
        this.data      = data;
        this.genesisBlock();
    }

    get  blockChain() {
        return this.listblockchian;
    }

    public createBlock = () => {
        let createdBlock;

        if ( this.getLastBlock()) {
            createdBlock = this.createBlocks(this.index, this.hash, this.prevHash, this.timestamp, this.data);
            this.index++;
        } else {
            // genesisBlock
            this.genesisBlock();
        }

        this.listblockchian.push(createdBlock);
        return createdBlock;
    }

    public createBlocks = (index: number = 0, hash: string = ' ', prevHash: string = ' ', timestamp: number = 0, data: string[] = []) => {
        const create = {'index' : index,
                'hash': hash,
                'prevHasd' : prevHash,
                'timestamp': timestamp,
                'data': data };
        return create;
    }

    public genesisBlock() {
        const basicBlock = {'index' : this.index,
            'hash': this.hash,
            'prevHasd' : this.prevHash,
            'timestamp': this.timestamp,
            'data': this.data };
        this.index++;
        this.listblockchian.push(basicBlock);
        return basicBlock;
    }

    public  getLastBlock() {
        return this.listblockchian[this.listblockchian.length - 1];
    }

    public getCurrentTimestamp = () => {
        return Math.round(new Date().getTime() / 1000);
    }

    public calculateHash = (index: number, prevHash: string, timestamp: number, data: string[])  => {
        return CryptoJS.SHA256(index + prevHash + timestamp + data).toString();
    }

}

export { Block };