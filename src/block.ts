import * as CryptoJS from 'crypto-js';
import { Transaction, TxIn, TxOut } from './transaction';
import { broadcastLatest } from './p2p';

class Block {

  public index: number;
  public hash: string;
  public prevHash: string;
  public timestamp: number;
  public data: Transaction[];

  constructor(index: number, hash: string, prevHash: string,
  timestamp: number, data: Transaction[]) {
    this.index = index;
    this.hash = hash;
    this.prevHash = prevHash;
    this.timestamp = timestamp;
    this.data = data;
  }
};

const genesisTransaction = new Transaction ();
genesisTransaction.txIns = [new TxIn()];
genesisTransaction.txOuts =  [new TxOut('', 0)];

const getBlockchain = (): Block[] => { return blockchain; };

const calculateHash = (index: number, prevHash: string, timestamp: number, data: Transaction[]) => {
  return CryptoJS.SHA256(index + prevHash + timestamp + data).toString();
};

const calculateHashFromBlock = (block: Block): string => {
  const { index, prevHash, timestamp, data } = block;
  return calculateHash(index, prevHash, timestamp, data);
};

const generateNextBlock = (blockData: Transaction[]) => {
  const prevBlock: Block = getLastBlock();
  const prevHash: string = prevBlock.hash;
  const nextIndex: number = prevBlock.index + 1;
  const nextTimestamp: number = getCurrentTimestamp();
  const nextHash: string = calculateHash(nextIndex, prevHash, nextTimestamp, blockData);
  return new Block(nextIndex, nextHash, prevHash, nextTimestamp, blockData);
};

const addBlockToChain = (block: Block): boolean => {
  const isValid = isBlockValid(block, blockchain[blockchain.length - 1]);
  if (isValid) {
    blockchain.push(block);
    return true;
  }
  return false;
};

const getLastBlock = (): Block => {
  return blockchain[blockchain.length - 1];
};

const getCurrentTimestamp = (): number => {
  return Math.round(new Date().getTime() / 1000);
};

const isBlockValid = (newBlock: Block, prevBlock: Block): boolean => {
  if (!isStructureValid(newBlock)) {
    console.log(`[Structure] Structure of new block is invalid`);
    return false;
  } else if (prevBlock.index + 1 !== newBlock.index) {
    console.log(`[Index] ${newBlock.index} is an invalid index. Expecting: ${prevBlock.index + 1}`);
    return false;
  } else if (prevBlock.hash !== newBlock.prevHash) {
    console.log(`[Previous Hash] ${newBlock.prevHash} is invalid. Expecting: ${prevBlock.hash}`);
    return false;
  } else if (calculateHashFromBlock(newBlock) !== newBlock.hash) {
    console.log(`[Next Hash] ${newBlock.hash} is invalid. Expecting: ${newBlock.hash}`);
    return false;
  }
  return true;
};

const isStructureValid = (block: Block): boolean => {
  return typeof block.index === 'number'
    && typeof block.hash === 'string'
    && typeof block.prevHash === 'string'
    && typeof block.timestamp === 'number'
    && typeof block.data === 'object';
};

const isChainValid = (bc: Block[]): boolean => {
  const isGenesisValid = (block: Block): boolean => {
    return JSON.stringify(block) === JSON.stringify(genesisBlock);
  };

  const _genesisBlock = bc[0];
  if (!isGenesisValid(_genesisBlock)) { return false; }

  for (let i = 1; i < bc.length; i += 1) {
    const prevBlock = bc[i - 1];
    const newBlock = bc[i];
    if (!isBlockValid(newBlock, prevBlock)) { return false; }
  }

  return true;
};

const genesisBlock: Block = new Block(
  0,
  '',
  '',
  getCurrentTimestamp(),
  []
);

genesisBlock.hash = calculateHashFromBlock(genesisBlock);

const blockchain: Block[] = [genesisBlock];


export {
  Block, addBlockToChain, getBlockchain, calculateHash, calculateHashFromBlock, getLastBlock,
  generateNextBlock, isChainValid, isStructureValid, getCurrentTimestamp, isBlockValid
}