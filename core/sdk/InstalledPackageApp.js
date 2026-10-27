import { BaseApp } from '../BaseApp.js';
import { AppSandbox } from './AppSandbox.js';

export default class InstalledPackageApp extends BaseApp {
    async onRun() {
        const manager = this.appManager.packageManager;
        const { pkg, source } = await manager.loadInstalled(this.appCore.rawData.packageId);
        this.sandbox = new AppSandbox(this.appContentRoot, pkg, this.unkay);
        await this.sandbox.run(source);
    }

    async onCleanup() {
        this.sandbox?.unmount();
    }
}
