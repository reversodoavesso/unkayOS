import { escapeHtml as e } from './preferences.js';

export async function computeCapabilities(token,signal) {
    const response=await fetch('/api/compute/capabilities',{headers:{Authorization:'Bearer '+token},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Compute indisponível.');return data;
}

/** Confirmation never allocates a container. Only the final Connect action requests a ticket. */
export async function confirmComputeSetup({token,signal}) {
    let caps=await computeCapabilities(token,signal);
    if(signal?.aborted)return null;
    const dialog=document.createElement('dialog');dialog.className='compute-setup';dialog.setAttribute('aria-labelledby','computeSetupTitle');
    document.body.append(dialog);
    return new Promise(resolve=>{
        let finished=false,poll=null;
        const finish=value=>{if(finished)return;finished=true;clearTimeout(poll);signal?.removeEventListener('abort',abort);dialog.close();dialog.remove();resolve(value);};
        const abort=()=>finish(null);signal?.addEventListener('abort',abort,{once:true});
        const render=(message='')=>{
            if(finished)return;clearTimeout(poll);
            const own=caps.instance,r=caps.resources;
            dialog.innerHTML=`<div class="compute-setup__body"><span class="workspace-eyebrow">SEU AMBIENTE REMOTO</span><h1 id="computeSetupTitle">Conectar ao Compute</h1>
              <p>Um Linux isolado para sua conta. A preparação é automática depois da sua confirmação.</p>
              <dl class="compute-resources"><div><dt>CPU</dt><dd>${e(r.cpu)} núcleo</dd></div><div><dt>Memória</dt><dd>${e(r.memoryMiB)} MB</dd></div><div><dt>Arquivos</dt><dd>${e(r.homeMiB)} MB</dd></div><div><dt>Inatividade</dt><dd>${e(r.idleMinutes)} min</dd></div></dl>
              <fieldset ${own?'disabled':''}><legend>Como usar este ambiente</legend>
                <label class="compute-choice"><input type="radio" name="computeMode" value="temporary" ${!own||own.mode==='temporary'?'checked':''}><span><strong>Sessão momentânea</strong><small>Ao desconectar ou ficar inativo, encerra e apaga os arquivos desta sessão.</small></span></label>
                <label class="compute-choice"><input type="radio" name="computeMode" value="retained" ${own?.mode==='retained'?'checked':''}><span><strong>Manter meus arquivos</strong><small>Salva o workspace e libera CPU e RAM ao desconectar ou ficar inativo. Retome depois com sua conta; os processos não continuam rodando.</small></span></label>
              </fieldset>
              <p class="compute-note">Uma instância por conta, até ${e(r.maxTotal)} em execução. Cada conexão dura até ${e(r.retentionMinutes)} min. A rede atual não tem acesso à Internet. Salve seus projetos em <code>/home/sandbox</code>; <code>/tmp</code> é descartável.</p>
              ${own?`<p>Seu ambiente: <strong>${e(({saved:'Arquivos salvos',running:'Em uso',saving:'Salvando arquivos',suspended:'Suspenso',starting:'Preparando'})[own.state]||own.state)}</strong>${own.savedAt?' · salvo em '+e(new Date(own.savedAt).toLocaleString('pt-BR')):''}.</p><button type="button" class="rda-button" data-compute="delete" ${caps.busy?'disabled':''}>Encerrar ambiente e apagar arquivos</button>`:''}
              <p class="compute-setup__status" role="status">${e(message||own?.error||(caps.requiresMfa?'Sua conta tem permissão, mas este login precisa comprovar MFA. Entre pelo SSO com segundo fator e tente novamente.':own?.attached?'Sua instância está conectada em outro terminal. Desconecte-o para retomar aqui.':!caps.capacityAvailable?'Todos os recursos estão reservados. Tente novamente mais tarde.':''))}</p>
              <footer><button type="button" class="rda-button" data-compute="cancel">Agora não</button><button type="button" class="rda-button" data-color="primary" data-compute="connect" ${!caps.canConnect||!caps.capacityAvailable||own?.attached?'disabled':''}>${own?'Retomar ambiente':'Conectar e preparar'}</button></footer></div>`;
            if(caps.busy)poll=setTimeout(async()=>{try{caps=await computeCapabilities(token,signal);render();}catch(error){render(error.message);}},1000);
        };
        dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
        dialog.addEventListener('click',async event=>{
            const button=event.target.closest('[data-compute]');if(!button)return;
            if(button.dataset.compute==='cancel'){finish(null);return;}
            if(button.dataset.compute==='connect'){finish(caps.instance?.mode||dialog.querySelector('input[name="computeMode"]:checked')?.value||'temporary');return;}
            if(button.dataset.compute==='delete'){
                button.dataset.compute='confirm-delete';button.textContent='Confirmar exclusão dos arquivos';return;
            }
            if(button.dataset.compute==='confirm-delete'){
                button.disabled=true;
                try{
                    const response=await fetch('/api/compute/instance',{method:'DELETE',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true}),signal});
                    const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível encerrar.');
                    caps=await computeCapabilities(token,signal);render('Ambiente encerrado.');
                }catch(error){if(!finished)render(error.message);}
            }
        });
        render();dialog.showModal();dialog.querySelector('[data-compute="cancel"]')?.focus();
    });
}

/** Offer setup after login without starting any container or repeatedly interrupting the user. */
export class ComputeInvitation {
    constructor(session){this.session=session;this.seen=new Set();this.change=()=>void this.refresh();}
    initialize(){this.session.auth?.on?.('change',this.change);this.change();}
    async refresh(){
        this.controller?.abort();this.banner?.remove();this.banner=null;
        const auth=this.session.auth,user=auth?.getCurrentUser?.(),token=auth?.getAuthToken?.();
        if(!token||!user)return;
        const id=user.id||user.sub;if(!id||this.seen.has(id))return;
        if(!['archon','demiurge','sysadmin','architect'].includes(user.role))return;
        this.controller=new AbortController();const signal=this.controller.signal;
        try{
            const caps=await computeCapabilities(token,signal);if(signal.aborted||!caps.authorized)return;
            this.seen.add(id);const banner=document.createElement('aside');banner.className='compute-invitation';banner.setAttribute('aria-label','Compute remoto disponível');
            banner.innerHTML=`<div><strong>Compute remoto disponível</strong><p>${caps.requiresMfa?'Sua conta tem permissão. Confira o segundo fator para conectar.':'Prepare um Linux para sua conta e escolha se deseja preservar seus arquivos.'}</p></div><button type="button" class="rda-button" data-color="primary" data-compute-invite="connect">Configurar conexão</button><button type="button" class="rda-button" data-compute-invite="dismiss" aria-label="Dispensar convite Compute">Agora não</button>`;
            banner.addEventListener('click',async event=>{const action=event.target.closest('[data-compute-invite]')?.dataset.computeInvite;if(!action)return;banner.remove();if(action==='connect')await this.session.launch('terminal',{computeSetup:true});});
            this.session.desktop.append(banner);this.banner=banner;
        }catch{/* A missing capability must not interrupt login or allocate resources. */}
    }
    destroy(){this.controller?.abort();this.banner?.remove();this.session.auth?.off?.('change',this.change);}
}
