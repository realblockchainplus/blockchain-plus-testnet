import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import { Transaction, TxIn, TxOut, isValidAddress, processTransactions, UnspentTxOut } from './transaction';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';
import { broadcastLatest, broadCastTransactionPool } from './p2p.1';
import { getBalance, getPublicFromWallet, createTransaction, getPrivateFromWallet, findUnspentTxOuts } from './wallet';

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

const getCurrentTimestamp = (): number => {
  return Math.round(new Date().getTime() / 1000);
};

const genesisTransaction = new Transaction();
genesisTransaction.txIns = [new TxIn()];
genesisTransaction.txOuts = [new TxOut(
  '', 
  '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
  50,
  '',
  '',
  '',
  '',
  '',
  getCurrentTimestamp()
)];
genesisTransaction.id = 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3';

const genesisBlock: Block = new Block(
  0,
  '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627',
  '',
  1465154705,
  [genesisTransaction]
);

let blockchain: Block[] = [genesisBlock];

let unspentTxOuts: UnspentTxOut[] = processTransactions(blockchain[0].data, [], 0);

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

const generateNextBlockWithTransaction = (receiverAddress: string, amount: number): Block => {
  if (!isValidAddress(receiverAddress)) { throw Error('Invalid address.') };
  if (typeof amount !== 'number') { throw Error(`Invalid amount. Expected type "number", got type "${typeof amount}".`) };
  const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), unspentTxOuts, getTransactionPool());
  const blockData: Transaction[] = [tx];
  return generateNextBlock(blockData);
};

const getLastBlock = (): Block => {
  return blockchain[blockchain.length - 1];
};

const getAccountBalance = (): number => {
  return getBalance(getPublicFromWallet(), unspentTxOuts);
};

const getUnspentTxOuts = (): UnspentTxOut[] => {
  return _.cloneDeep(unspentTxOuts);
};

const setUnspentTxOuts = (newUnspentTxOuts: UnspentTxOut[]) => {
  console.log('Replacing unspentTxOuts with newUnspentTxOuts');
  unspentTxOuts = newUnspentTxOuts;
};

const getMyUnspentTransactionOutputs = () => {
  return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};

const sendTransaction = (address: string, amount: number): Transaction => {
  const tx: Transaction = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
  addToTransactionPool(tx, getUnspentTxOuts());
  broadCastTransactionPool();
  return tx;
};

const replaceChain = (newBlocks: Block[]) => {
  const aUnspentTxOuts = isChainValid(newBlocks);
  const validChain: boolean = aUnspentTxOuts !== null;
  if (validChain) {

    console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
    blockchain = newBlocks;
    setUnspentTxOuts(aUnspentTxOuts);
    updateTransactionPool(unspentTxOuts);
    broadcastLatest();
  } else {
    console.log('Received blockchain invalid');
  }
};

const isBlockValid = (newBlock: Block, prevBlock: Block): boolean => {
  if (!isStructureValid(newBlock)) {
    console.log(`[Structure] Structure of new block is invalid`);
    return false;
  }
  else if (prevBlock.index + 1 !== newBlock.index) {
    console.log(`[Index] ${newBlock.index} is an invalid index. Expecting: ${prevBlock.index + 1}`);
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
  return typeof block.index === 'number'
    && typeof block.hash === 'string'
    && typeof block.prevHash === 'string'
    && typeof block.timestamp === 'number'
    && typeof block.data === 'object';
};

const isChainValid = (bc: Block[]): UnspentTxOut[] => {
  const isGenesisValid = (block: Block): boolean => {
    return JSON.stringify(block) === JSON.stringify(genesisBlock)
  };

  const _genesisBlock = bc[0];
  if (!isGenesisValid(_genesisBlock)) { return null; };

  let _unspentTxOuts: UnspentTxOut[] = [];
  for (let i = 1; i < bc.length; i += 1) {
    const prevBlock = bc[i - 1];
    const newBlock = bc[i];
    if (!isBlockValid(newBlock, prevBlock)) { return null; }

    _unspentTxOuts = processTransactions(newBlock.data, _unspentTxOuts, newBlock.index);
    if (_unspentTxOuts === null) {
      console.log('Invalid transactions in the blockchain.');
      return null;
    }
  }

  return _unspentTxOuts;
};

const addBlockToChain = (block: Block): boolean => {
  const isValid = isBlockValid(block, getLastBlock());
  if (isValid) {
    const retVal: UnspentTxOut[] = processTransactions(block.data, getUnspentTxOuts(), block.index);
    if (retVal == null) {
      console.log('Block is not valid due to transactions.');
      return false;
    }
    else {
      blockchain.push(block);
      console.log('New block pushed to chain');
      setUnspentTxOuts(retVal);
      console.log('After [setUnspentTxOuts]');
      updateTransactionPool(unspentTxOuts);
      console.log('After [updateTransactionPool]');
      console.log('Calling [broadcastLatest]');
      broadcastLatest();
      return true;
    }
  }
  return false;
};

const handleReceivedTransaction = (transaction: Transaction) => {
  addToTransactionPool(transaction, getUnspentTxOuts());
};

genesisBlock.hash = calculateHashFromBlock(genesisBlock);

export {
  Block, addBlockToChain, getBlockchain, calculateHash, calculateHashFromBlock, getLastBlock,
  generateNextBlock, generateNextBlockWithTransaction, getAccountBalance, replaceChain,
  isChainValid, isStructureValid, getCurrentTimestamp, isBlockValid, handleReceivedTransaction,
  sendTransaction
}