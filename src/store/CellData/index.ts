// import {makeObservable, observable, action, computed, flow} from 'mobx';
import {makeAutoObservable, runInAction} from 'mobx';

class CellData {
    data: string[][] = [];
    // 官方文档: https://zh.mobx.js.org/observable-state.html#%E5%8F%AF%E7%94%A8%E7%9A%84%E6%B3%A8%E8%A7%A3
    constructor() {
        makeAutoObservable(this);
    }

    getCellData = async () => {
        try {
            const res = await fetch('https://api.github.com/repos/mobxjs/mobx/commits');
            const data = await res.json();
            runInAction(() => {
                this.data = data.map((item: any) => [item.sha, item.commit.message]);
            });
        } catch (err) {
            console.log(err);
        }
    };
}

const cellStore = new CellData();
export {cellStore};
