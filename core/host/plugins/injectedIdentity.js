export async function create({ identityProvider }) {
    if (typeof identityProvider !== 'function') throw new Error('O perfil sso exige um identityProvider registrado no host.');
    return { identity: await identityProvider() };
}
