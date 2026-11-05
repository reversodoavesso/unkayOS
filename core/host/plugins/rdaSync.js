export async function create({ context, deployment }) {
    const { MinioSyncDriver } = await import('../../sync/MinioSyncDriver.js');
    const driver = new MinioSyncDriver({ getAuth: () => context.require(deployment.bindings.identity) });
    return { sync: { sync: () => driver.sync() } };
}
