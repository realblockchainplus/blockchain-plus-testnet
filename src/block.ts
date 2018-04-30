import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import { Transaction, isValidAddress } from './transaction';
import { broadcastLatest } from './p2p';
import { getPublicFromWallet, getPrivateFromWallet } from './wallet';

class Block {

  public hash: string;
  public prevHash: string;
  public timestamp: number;
  public data: Transaction[];

  constructor(hash: string, prevHash: string,
    timestamp: number, data: Transaction[]) {
    this.hash = hash;
    this.prevHash = prevHash;
    this.timestamp = timestamp;
    this.data = data;
  }
};

const getCurrentTimestamp = (): number => {
  return Math.round(new Date().getTime() / 1000);
};

const genesisTransaction = new Transaction(
  '', 
  '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
  50,
  getCurrentTimestamp()
);
genesisTransaction.id = 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3';

const genesisBlock: Block = new Block(
  '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627',
  '',
  1465154705,
  [genesisTransaction]
);

let blockchain: Block[] = [genesisBlock];

const getBlockchain = (): Block[] => { return blockchain; };

const calculateHash = (prevHash: string, timestamp: number, data: Transaction[]) => {
  return CryptoJS.SHA256(prevHash + timestamp + data).toString();
};

const calculateHashFromBlock = (block: Block): string => {
  const { prevHash, timestamp, data } = block;
  return calculateHash(prevHash, timestamp, data);
};

const generateNextBlock = (blockData: Transaction[]) => {
  const prevBlock: Block = getLastBlock();
  const prevHash: string = prevBlock.hash;
  const nextTimestamp: number = getCurrentTimestamp();
  const nextHash: string = calculateHash(prevHash, nextTimestamp, blockData);
  return new Block(nextHash, prevHash, nextTimestamp, blockData);
};

const getLastBlock = (): Block => {
  return blockchain[blockchain.length - 1];
};

const isBlockValid = (newBlock: Block, prevBlock: Block): boolean => {
  if (!isStructureValid(newBlock)) {
    console.log(`[Structure] Structure of new block is invalid`);
    return false;
  }
  else if (prevBlock.hash !== newBlock.prevHash) {
    console.log(`[Previous Hash] ${newBlock.prevHash} is invalid. Expecting: ${prevBlock.hash}`);
    return false;
  }
  else if (calculateHashFromBlock(newBlock) !== newBlock.hash) {
    console.log(`[Next Hash] ${newBlock.hash} is invalid. Expecting: ${newBlock.hash}`);
    return false;
  }
  return true;
};

const isStructureValid = (block: Block): boolean => {
  return typeof block.hash === 'string'
    && typeof block.prevHash === 'string'
    && typeof block.timestamp === 'number'
    && typeof block.data === 'object';
};

genesisBlock.hash = calculateHashFromBlock(genesisBlock);

export {
  Block, getBlockchain, calculateHash, calculateHashFromBlock, getLastBlock,
  generateNextBlock, isStructureValid,
  getCurrentTimestamp, isBlockValid
}