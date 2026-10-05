import {h,icon,openDialog} from './forms.js';

const roleName=role=>role==='admin'?'Administrator':'Mitarbeiter';
const usernameField=value=>`<label class="field full"><span>Benutzername <b>*</b></span><input name="username" value="${h(value)}" autocomplete="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9._-]+" placeholder="z. B. Max"><small>3–64 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.</small></label>`;
const displayField=value=>`<label class="field full"><span>Anzeigename</span><input name="displayName" value="${h(value)}" maxlength="100" autocomplete="name" placeholder="Dein Name"></label>`;
const newPasswordFields=(required=true)=>`<label class="field full"><span>${required?'Passwort':'Neues Passwort'}${required?' <b>*</b>':''}</span><input type="password" name="password" autocomplete="new-password" ${required?'required':''} minlength="12" maxlength="256"><small>${required?'Mindestens 12 Zeichen.':'Leer lassen, um das bisherige Passwort zu behalten. Mindestens 12 Zeichen für ein neues Passwort.'}</small></label><label class="field full"><span>Passwort bestätigen${required?' <b>*</b>':''}</span><input type="password" name="passwordConfirm" autocomplete="new-password" ${required?'required':''} maxlength="256"></label>`;
const footer=label=>`<div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}${label}</button></div>`;
const errorField='<p class="form-error" role="alert" hidden></p>';
function confirmPassword(data){if(data.get('password')!==data.get('passwordConfirm'))throw new Error('Die Passwörter stimmen nicht überein.');}
function submit(form,action){form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]'),error=form.querySelector('.form-error');button.disabled=true;error.hidden=true;try{await action(new FormData(form));}catch(err){error.textContent=err.message;error.hidden=false;}finally{button.disabled=false;}};}

export function openLogin(ctx,after=()=>{}){
  const setup=ctx.session.setupRequired;
  const page=document.querySelector('#auth-page');
  page.dataset.stage=setup?'setup':'login';
  const dialog=document.querySelector('#dialog');if(dialog.open)dialog.close();
  page.innerHTML=`<div class="brand auth-brand"><span class="brand-mark">↩</span><span>retourenboard<span class="brand-dot">.</span></span></div><section class="auth-card"><header class="auth-header"><h1 id="auth-title">${setup?'Ersten Administrator anlegen':'Willkommen zurück'}</h1><p>${setup?'Richte deinen persönlichen Zugang ein. Dieser erste Account verwaltet weitere Konten.':'Melde dich mit deinem persönlichen Konto an.'}</p></header><form id="login-form"><div class="dialog-body">${setup?`<div class="permission-note">${icon('lock')}<p>Dein erster Account erhält Administratorrechte. Weitere Personen werden später im Adminbereich hinzugefügt.</p></div>`:''}<div class="form-grid">${usernameField('')}${setup?displayField('')+newPasswordFields():`<label class="field full"><span>Passwort <b>*</b></span><input type="password" name="password" autocomplete="current-password" required maxlength="256" placeholder="Dein Passwort"></label>`}</div>${errorField}</div><div class="dialog-footer"><button type="submit" class="btn primary">${icon(setup?'check':'unlock')}${setup?'Administrator anlegen':'Anmelden'}</button></div></form></section><p class="auth-caption">Dein gemeinsamer Retouren-Arbeitsplatz.${ctx.session.version?`<span class="auth-version">Version ${h(ctx.session.version)}</span>`:""}</p>`;
  submit(page.querySelector('form'),async data=>{
    if(setup)confirmPassword(data);
    const body={username:data.get('username'),password:data.get('password'),...(setup?{displayName:data.get('displayName')}:{})};
    ctx.applySession(await ctx.api(setup?'/api/setup':'/api/login',{method:'POST',body}));
    page.replaceChildren();await ctx.reload();ctx.toast(`Angemeldet als ${ctx.session.user.displayName}.`);await after();
  });
}

export function openAccount(ctx){
  const user=ctx.session.user;if(!user)return openLogin(ctx);
  const dialog=openDialog({title:'Mein Konto',subtitle:`${user.displayName} · ${roleName(user.role)}`,body:`<form id="password-form"><div class="dialog-body"><div class="account-profile"><span class="account-avatar">${icon('lock')}</span><div><strong>${h(user.displayName)}</strong><span>${h(user.username)} · ${roleName(user.role)}</span></div><button class="btn secondary small" type="button" id="account-logout">Abmelden</button></div><h3 class="account-form-title">Passwort ändern</h3><div class="form-grid"><label class="field full"><span>Aktuelles Passwort <b>*</b></span><input type="password" name="currentPassword" autocomplete="current-password" required maxlength="256"></label>${newPasswordFields()}</div><p class="muted small-text">Nach der Änderung meldest du dich mit dem neuen Passwort erneut an.</p>${errorField}</div>${footer('Passwort ändern')}</form>`});
  submit(dialog.querySelector('form'),async data=>{
    confirmPassword(data);
    ctx.applySession(await ctx.api('/api/account/password',{method:'POST',body:{currentPassword:data.get('currentPassword'),newPassword:data.get('password')}}));
    dialog.close();await ctx.reload();ctx.toast('Passwort geändert. Bitte erneut anmelden.');openLogin(ctx);
  });
  dialog.querySelector('#account-logout').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{ctx.applySession(await ctx.api('/api/logout',{method:'POST',body:{}}));dialog.close();await ctx.reload();ctx.toast('Du bist abgemeldet.');}
    catch(err){ctx.toast(err.message);button.disabled=false;}
  };
}

export function renderUsers(){return `<section class="panel"><div class="panel-heading"><div><h2>Benutzerkonten</h2><p>Persönliche Zugänge und Berechtigungen für den gemeinsamen Bestand.</p></div><button class="btn primary" id="user-create">${icon('plus')}Konto anlegen</button></div><div id="user-list" aria-live="polite"><p class="muted user-loading">Konten werden geladen …</p></div></section><p class="muted admin-help">Mitarbeiter bearbeiten Produkte, Retouren und Anhänge. Administratoren verwalten zusätzlich Stammdaten und Konten. Der letzte aktive Administrator bleibt erhalten.</p>`;}
export async function bindUsers(ctx,root){
  if(!ctx.isAdmin)return;
  root.querySelector('#user-create').onclick=()=>userForm(ctx);
  const list=root.querySelector('#user-list');
  try{
    const users=await ctx.api('/api/users');if(!list.isConnected||!ctx.isAdmin)return;
    list.innerHTML=`<div class="table-scroll"><table><thead><tr><th>Name / Benutzername</th><th>Rolle</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>${users.map(user=>`<tr><td><strong>${h(user.displayName)}</strong><div class="user-name">${h(user.username)}${user.id===ctx.session.user.id?' · Dein Konto':''}</div></td><td>${roleName(user.role)}</td><td><span class="status ${user.active?'done':'archived'}"><span></span>${user.active?'Aktiv':'Deaktiviert'}</span></td><td><button class="icon-btn" data-user-edit="${user.id}" aria-label="Konto ${h(user.username)} bearbeiten">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
    list.querySelectorAll('[data-user-edit]').forEach(el=>el.onclick=()=>userForm(ctx,users.find(user=>user.id===Number(el.dataset.userEdit))));
  }catch(err){if(list.isConnected){list.textContent=err.message;list.classList.add('user-loading');}}
}
function userForm(ctx,user={}){
  const edit=!!user.id;
  const dialog=openDialog({title:edit?'Konto bearbeiten':'Konto anlegen',subtitle:edit?'Berechtigungen ändern, Zugang deaktivieren oder ein neues Passwort setzen.':'Das neue Konto sieht und bearbeitet denselben Bestand.',body:`<form id="user-form"><div class="dialog-body"><div class="form-grid">${usernameField(user.username)}${displayField(user.displayName)}<label class="field full"><span>Rolle</span><select name="role"><option value="member"${user.role!=='admin'?' selected':''}>Mitarbeiter</option><option value="admin"${user.role==='admin'?' selected':''}>Administrator</option></select></label>${newPasswordFields(!edit)}${edit?`<label class="checkbox-field full"><input type="checkbox" name="active"${user.active?' checked':''}>Konto aktiv</label>`:''}</div>${errorField}</div>${footer(edit?'Speichern':'Konto anlegen')}</form>`});
  const form=dialog.querySelector('form');
  submit(form,async data=>{
    confirmPassword(data);
    const body={username:data.get('username'),displayName:data.get('displayName'),role:data.get('role'),active:edit?form.elements.active.checked:true,...(data.get('password')?{password:data.get('password')}:{})};
    await ctx.api(`/api/users${edit?'/'+user.id:''}`,{method:edit?'PUT':'POST',body});dialog.close();await ctx.reload();ctx.toast(edit?'Konto gespeichert.':'Konto angelegt.');
  });
}
