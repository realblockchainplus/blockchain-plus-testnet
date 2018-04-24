import {Block} from './blockOpp';

class Transaction extends Block {
    constructor() {
        super();
    }

    public transctionInfo = (sender: any[] = ['empty']) => {
        this.data = [sender];
        return this.createBlock();
    }
}

const transaction = new Transaction();

export { transaction };
