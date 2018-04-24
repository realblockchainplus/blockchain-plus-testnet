import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import { Transaction, TxIn, TxOut, isValidAddress, processTransactions, UnspentTxOut } from './transaction';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';
import { broadcastLatest, broadCastTransactionPool } from './p2p';
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
genesisTransaction.txOuts = [new TxOut('04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a', 500)];

const genesisBlock: Block = new Block(
  0,
  '',
  '',
  getCurrentTimestamp(),
  [genesisTransaction]
);

let blockchain: Block[] = [genesisBlock];

let unspentTxOuts: UnspentTxOut[] = [];



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
  if (!isValidAddress(receiverAddress)) { throw Error('Invalid address.'); }
  if (typeof amount !== 'number') { throw Error(`Invalid amount. Expected type "number", got type "${typeof amount}".`); }
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

const isBlockValid = (newBlock: Block, prevBlock: Block): boolean => {
  if (!isStructureValid(newBlock)) {
    console.log(`[Structure] Structure of new block is invalid`);
    return false;
<<<<<<< HEAD
  } else if (prevBlock.index + 1 !== newBlock.index) {
=======
  }
  else if (prevBlock.index + 1 !== newBlock.index) {
>>>>>>> 218434a4f8047b66f294468985565661a3b5e284
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

const isChainValid = (bc: Block[]): UnspentTxOut[] => {
  const isGenesisValid = (block: Block): boolean => {
    return JSON.stringify(block) === JSON.stringify(genesisBlock);
  };

  const _genesisBlock = bc[0];
<<<<<<< HEAD
  if (!isGenesisValid(_genesisBlock)) { return false; }

=======
  if (!isGenesisValid(_genesisBlock)) { return null; };

  let _unspentTxOuts: UnspentTxOut[] = [];
>>>>>>> 218434a4f8047b66f294468985565661a3b5e284
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
<<<<<<< HEAD

  return true;
};
=======
>>>>>>> 218434a4f8047b66f294468985565661a3b5e284

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
      setUnspentTxOuts(retVal);
      updateTransactionPool(unspentTxOuts);
      broadcastLatest();
      return true;
    }
  }
  return false;
};

<<<<<<< HEAD
genesisBlock.hash = calculateHashFromBlock(genesisBlock);

const blockchain: Block[] = [genesisBlock];
=======
const handleReceivedTransaction = (transaction: Transaction) => {
  addToTransactionPool(transaction, getUnspentTxOuts());
};

genesisBlock.hash = calculateHashFromBlock(genesisBlock);
>>>>>>> 218434a4f8047b66f294468985565661a3b5e284


export {
  Block, addBlockToChain, getBlockchain, calculateHash, calculateHashFromBlock, getLastBlock,
  generateNextBlock, generateNextBlockWithTransaction, getAccountBalance,
  isChainValid, isStructureValid, getCurrentTimestamp, isBlockValid, handleReceivedTransaction
}