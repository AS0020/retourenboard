import {randomBytes,scryptSync} from 'node:crypto';
import {InputError} from '../shared/model.js';
import {verifyPassword} from './users.js';

export function createAuth({users,now=Date.now}){
  const sessions=new Map(),attempts=new Map(),ttl=8*60*60*1000,window=15*60*1000;
  const dummySalt=randomBytes(32).toString('hex'),dummy={passwordSalt:dummySalt,passwordHash:scryptSync(randomBytes(32).toString('hex'),dummySalt,64).toString('hex')};
  function prune(){const time=now();for(const[token,session]of sessions)if(session.expiresAt<=time)sessions.delete(token);for(const[ip,attempt]of attempts)if(attempt.expiresAt<=time)attempts.delete(ip);}
  function startSession(userId){
    prune();const account=users.credentialsById(userId);if(!account?.active)throw new InputError('Anmeldedaten sind nicht korrekt.',401);
    if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);
    const token=randomBytes(32).toString('hex'),session={userId,authVersion:account.authVersion,csrfToken:randomBytes(32).toString('hex'),expiresAt:now()+ttl};sessions.set(token,session);
    return {token,csrfToken:session.csrfToken,expiresAt:session.expiresAt,user:users.get(userId)};
  }
  return {
    startSession,
    async login(input,ip){
      prune();const attempt=attempts.get(ip)??{count:0,expiresAt:now()+window};if(attempt.count>=10)throw new InputError('Zu viele Fehlversuche. Bitte nach 15 Minuten erneut versuchen.',429);
      attempt.count++;attempts.set(ip,attempt);if(attempts.size>10000)attempts.delete(attempts.keys().next().value);
      const account=typeof input?.username==='string'&&input.username.length<=64?users.credentialsByName(input.username):null;
      const valid=await verifyPassword(input?.password,account??dummy),current=account?users.credentialsById(account.id):null;
      if(!valid||!current?.active||current.authVersion!==account.authVersion)throw new InputError('Anmeldedaten sind nicht korrekt.',401);
      attempts.delete(ip);return startSession(current.id);
    },
    getSession(token){
      prune();const session=sessions.get(token);if(!session)return null;
      const account=users.credentialsById(session.userId);if(!account?.active||account.authVersion!==session.authVersion){sessions.delete(token);return null;}
      return {csrfToken:session.csrfToken,expiresAt:session.expiresAt,user:users.get(session.userId)};
    },
    logout:token=>sessions.delete(token)
  };
}
