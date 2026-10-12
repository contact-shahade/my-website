import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

// The publishable key is intended for browser use. Row-level security in Supabase
// restricts every request to the signed-in user's team membership.
const SUPABASE_URL = 'https://qaqacjvxoavcinrljisw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vRU5SIPZvgBbtKXze1xs5A_vcMrliLC';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const state = { user: null, team: null, membership: null, players: [], matches: [], events: [], channel: null, signup: false };
const pageCopy = {
  overview: ['Every player. Every game.', 'Matches, player stats, and the moments worth keeping.'],
  matches: ['Match centre.', 'Follow the schedule and keep live scores up to date.'],
  players: ['Player portfolios.', 'A season of performances, captured in one place.'],
  highlights: ['Keep the moments.', 'Tag plays, add context, and save private video clips.']
};

function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4200);
}
function fail(error) { console.error(error); toast(error?.message || 'Something went wrong. Please try again.', true); }
function initials(value = '') { return value.trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase() || 'HC'; }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function dateLabel(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Time to be confirmed'; }
function tags(value) { return (Array.isArray(value) ? value : []).map(escapeHtml).join(' · '); }
function points(type) { return ({ two_point: 2, three_point: 3, free_throw: 1 })[type] || 0; }
function playLabel(type) { return ({ two_point:'2-point basket', three_point:'3-point basket', free_throw:'Free throw', rebound:'Rebound', assist:'Assist', steal:'Steal', block:'Block', turnover:'Turnover', foul:'Foul', substitution:'Substitution', note:'Note' })[type] || type; }
function setBusy(form, busy) { const button = form.querySelector('[type="submit"]'); if (button) { button.disabled = busy; button.dataset.label ||= button.textContent; button.textContent = busy ? 'Please wait…' : button.dataset.label; } }

function showAuth() { $('authGate').classList.remove('hidden'); $('setupGate').classList.add('hidden'); $('app').classList.add('hidden'); }
function showSetup() { $('authGate').classList.add('hidden'); $('setupGate').classList.remove('hidden'); $('app').classList.add('hidden'); }
function showApp() { $('authGate').classList.add('hidden'); $('setupGate').classList.add('hidden'); $('app').classList.remove('hidden'); }

async function initialize() {
  const { data: { session }, error } = await supabase.auth.getSession(); if (error) return fail(error);
  if (session) await loadWorkspace(session.user); else showAuth();
  supabase.auth.onAuthStateChange((_event, sessionNow) => {
    setTimeout(() => sessionNow ? loadWorkspace(sessionNow.user) : (stopRealtime(), showAuth()), 0);
  });
}

async function loadWorkspace(user) {
  state.user = user;
  const { data: memberships, error } = await supabase.from('team_members').select('team_id,member_role,teams(id,name,join_code)').limit(1);
  if (error) return fail(error);
  const membership = memberships?.[0];
  if (!membership?.teams) { state.team = null; showSetup(); return; }
  state.membership = membership; state.team = membership.teams; showApp();
  $('sidebarTeam').textContent = state.team.name; $('topTeam').textContent = state.team.name; $('seasonTeam').textContent = `${new Date().getFullYear()} SEASON · ${state.team.name.toUpperCase()}`;
  $('sidebarMember').textContent = `${membership.member_role || 'Team member'} · ${user.email || ''}`;
  $('topAvatar').textContent = initials(state.team.name); document.querySelector('.account-row .avatar').textContent = initials(state.team.name);
  $('inviteShort').textContent = state.team.join_code ? state.team.join_code.slice(0, 8).toUpperCase() : '—';
  await refreshData(); subscribeRealtime();
}

async function refreshData() {
  if (!state.team) return;
  const [players, matches, events] = await Promise.all([
    supabase.from('players').select('*').eq('team_id', state.team.id).order('display_name'),
    supabase.from('matches').select('*').eq('team_id', state.team.id).order('starts_at', { ascending: true, nullsFirst: false }),
    supabase.from('match_events').select('*').eq('team_id', state.team.id).order('created_at', { ascending: false }).limit(100)
  ]);
  for (const result of [players, matches, events]) if (result.error) return fail(result.error);
  state.players = players.data || []; state.matches = matches.data || []; state.events = events.data || [];
  renderAll();
}

function subscribeRealtime() {
  stopRealtime(); if (!state.team) return;
  state.channel = supabase.channel(`team-${state.team.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `team_id=eq.${state.team.id}` }, refreshData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `team_id=eq.${state.team.id}` }, refreshData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${state.team.id}` }, refreshData)
    .subscribe();
}
function stopRealtime() { if (state.channel) supabase.removeChannel(state.channel); state.channel = null; }

function scoreFor(match) {
  const home = match.home_score ?? 0, away = match.away_score ?? 0;
  return `${home} : ${away}`;
}
function matchStatus(match) { return (match.status || 'upcoming').toLowerCase(); }
function renderAll() {
  const live = state.matches.filter(m => matchStatus(m) === 'live'); const next = state.matches.filter(m => matchStatus(m) === 'upcoming');
  $('gamesPlayed').textContent = state.matches.filter(m => matchStatus(m) === 'completed').length;
  $('rosterCount').textContent = state.players.length; $('clipCount').textContent = state.events.filter(e => e.video_url).length;
  $('liveMatchArea').innerHTML = live.length ? live.map(renderLive).join('') : 'No game is live right now.<br><span>Start a match to put the score on the board.</span>';
  $('upcomingList').innerHTML = next.length ? next.slice(0, 4).map(renderMatch).join('') : '<div class="empty-message">No upcoming matches yet.</div>';
  $('matchesList').innerHTML = state.matches.length ? state.matches.map(renderMatch).join('') : '<div class="empty-message">No matches have been added.</div>';
  const ranked = [...state.players].sort((a,b) => playerPoints(b.id) - playerPoints(a.id));
  $('spotlightList').innerHTML = ranked.length ? ranked.slice(0,4).map(renderPlayer).join('') : '<div class="empty-message">Add players to see their season portfolios.</div>';
  $('playersList').innerHTML = ranked.length ? ranked.map(renderPlayer).join('') : '<div class="empty-message">No players have been added yet.</div>';
  $('eventsList').innerHTML = state.events.length ? state.events.map(renderEvent).join('') : '<div class="empty-message">No plays logged yet. Capture your first moment from a match.</div>';
  $('eventMatch').innerHTML = state.matches.map(m => `<option value="${m.id}">${escapeHtml(m.home_team)} vs ${escapeHtml(m.away_team)}</option>`).join('');
  $('eventPlayer').innerHTML = '<option value="">Team play / no player</option>' + state.players.map(p => `<option value="${p.id}">${escapeHtml(p.display_name)}${p.jersey_number != null ? ` · #${p.jersey_number}` : ''}</option>`).join('');
  $('addEvent').disabled = !state.matches.length;
  const myPlayer = state.players.find(p => p.user_id === state.user?.id); const portfolio = $('myPortfolio');
  if (myPlayer) { portfolio.classList.remove('hidden'); portfolio.innerHTML = `<p class="eyebrow">YOUR PORTFOLIO</p><h2>${escapeHtml(myPlayer.display_name)}</h2><p>${escapeHtml(myPlayer.position || 'Player')} · ${playerPoints(myPlayer.id)} points · ${playerEventCount(myPlayer.id)} tagged plays</p>`; }
  else portfolio.classList.add('hidden');
}
function renderLive(m) { return `<div class="live-game"><div><small>${escapeHtml(m.competition || 'LIVE GAME')} · ${escapeHtml(m.venue || 'Venue TBD')}</small><div class="score-line"><strong>${escapeHtml(m.home_team)}</strong><b>${scoreFor(m)}</b><strong>${escapeHtml(m.away_team)}</strong></div><small>${escapeHtml(m.period ? `Period ${m.period}` : 'In progress')} ${m.game_clock ? `· ${escapeHtml(m.game_clock)}` : ''}</small></div><button class="button secondary" data-log-match="${m.id}">＋ Log play</button></div>`; }
function renderMatch(m) { const status = matchStatus(m); const next = status === 'upcoming' ? 'live' : status === 'live' ? 'completed' : 'upcoming'; const action = status === 'upcoming' ? 'Start' : status === 'live' ? 'Finish' : ''; return `<article class="match-row"><div class="match-status ${escapeHtml(status)}">${escapeHtml(status)}</div><div class="match-main"><div class="match-teams"><strong>${escapeHtml(m.home_team)}</strong><span>vs</span><strong>${escapeHtml(m.away_team)}</strong></div><div class="match-meta">${escapeHtml(dateLabel(m.starts_at))}${m.venue ? ` · ${escapeHtml(m.venue)}` : ''}${m.tags?.length ? ` · ${tags(m.tags)}` : ''}</div></div><div class="match-score">${status === 'upcoming' ? '—' : scoreFor(m)}</div>${action ? `<button class="button small-button" data-status-match="${m.id}" data-next-status="${next}">${action}</button>` : ''}<button class="button small-button" data-log-match="${m.id}">Log play</button></article>`; }
function playerEventCount(id) { return state.events.filter(e => e.player_id === id).length; }
function playerPoints(id) { return state.events.filter(e => e.player_id === id).reduce((sum,e) => sum + points(e.event_type), 0); }
function renderPlayer(p) { return `<article class="player-card"><div class="player-avatar">${p.jersey_number != null ? `#${escapeHtml(p.jersey_number)}` : initials(p.display_name)}</div><div class="player-info"><h3>${escapeHtml(p.display_name)}</h3><p>${escapeHtml(p.position || 'Player')}${p.bio ? ` · ${escapeHtml(p.bio)}` : ''}</p></div><div class="player-metrics"><strong>${playerPoints(p.id)}</strong><small>POINTS</small></div><div class="player-metrics"><strong>${playerEventCount(p.id)}</strong><small>PLAYS</small></div></article>`; }
function renderEvent(e) { const player = state.players.find(p => p.id === e.player_id); const match = state.matches.find(m => m.id === e.match_id); return `<article class="event-row"><div class="event-type">${escapeHtml(playLabel(e.event_type))}</div><div class="event-main"><strong>${escapeHtml(player?.display_name || 'Team play')}${e.points ? ` · +${e.points} points` : ''}</strong><p>${escapeHtml(match ? `${match.home_team} vs ${match.away_team}` : 'Match')}${e.period ? ` · Period ${e.period}` : ''}${e.game_clock ? ` · ${escapeHtml(e.game_clock)}` : ''}${e.description ? ` · ${escapeHtml(e.description)}` : ''}</p><small>${tags(e.tags)}</small></div>${e.video_url ? `<button class="text-button" data-video="${escapeHtml(e.video_url)}">▶ Watch clip</button>` : ''}</article>`; }

function openDialog(id) { const d = $(id); if (id === 'eventDialog' && !state.matches.length) return toast('Add a match before logging a play.', true); d.showModal(); }
document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('.nav-link, .page-jump').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
function navigate(page) { if (!pageCopy[page]) return; document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${page}`)); document.querySelectorAll('.nav-link').forEach(v => v.classList.toggle('active', v.dataset.page === page)); $('topPage').textContent = page[0].toUpperCase() + page.slice(1); $('pageTitle').textContent = pageCopy[page][0]; $('pageDescription').textContent = pageCopy[page][1]; $('primaryAction').classList.toggle('hidden', page !== 'overview'); }
$('primaryAction').addEventListener('click', () => openDialog('matchDialog'));
document.querySelectorAll('.open-match').forEach(b => b.addEventListener('click', () => openDialog('matchDialog')));
$('addPlayer').addEventListener('click', () => openDialog('playerDialog'));
$('addEvent').addEventListener('click', () => openDialog('eventDialog'));
document.body.addEventListener('click', async e => {
  const statusButton = e.target.closest('[data-status-match]'); if (statusButton) { const { error } = await supabase.from('matches').update({ status: statusButton.dataset.nextStatus }).eq('id', statusButton.dataset.statusMatch); if (error) fail(error); else await refreshData(); }
  const log = e.target.closest('[data-log-match]'); if (log) { $('eventMatch').value = log.dataset.logMatch; openDialog('eventDialog'); }
  const video = e.target.closest('[data-video]'); if (video) { const { data, error } = await supabase.storage.from('game-clips').createSignedUrl(video.dataset.video, 300); if (error) return fail(error); const w = window.open(data.signedUrl, '_blank', 'noopener'); if (!w) toast('Allow pop-ups to watch this clip.', true); }
});
$('copyInvite').addEventListener('click', async () => { if (!state.team?.join_code) return; await navigator.clipboard.writeText(state.team.join_code); toast('Invite code copied.'); });

$('authToggle').addEventListener('click', () => { state.signup = !state.signup; $('authTitle').textContent = state.signup ? 'Create your account.' : 'Welcome back.'; $('authSubmit').textContent = state.signup ? 'Create account' : 'Sign in'; $('authPassword').autocomplete = state.signup ? 'new-password' : 'current-password'; $('authToggle').textContent = state.signup ? 'Already registered? Sign in' : 'New to Courtside? Create an account'; });
$('authForm').addEventListener('submit', async e => { e.preventDefault(); const f = e.currentTarget; setBusy(f, true); try { const email = $('authEmail').value.trim(), password = $('authPassword').value; const result = state.signup ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password }); if (result.error) throw result.error; if (state.signup && !result.data.session) toast('Account created. Check your email to confirm it, then sign in.'); else if (result.data.user) await loadWorkspace(result.data.user); } catch (err) { fail(err); } finally { setBusy(f, false); } });
$('setupSignOut').addEventListener('click', () => supabase.auth.signOut()); $('signOut').addEventListener('click', () => supabase.auth.signOut());

$('createTeamForm').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; setBusy(f,true); try { const user=state.user; const { data: team, error }=await supabase.from('teams').insert({ name:$('newTeamName').value.trim(), created_by:user.id }).select('id,name,join_code').single(); if(error) throw error; const { error: memberError }=await supabase.from('team_members').insert({ team_id:team.id,user_id:user.id,member_role:'coach' }); if(memberError) throw memberError; const name=$('ownerPlayerName').value.trim(); if(name) { const { error: playerError }=await supabase.from('players').insert({team_id:team.id,display_name:name,jersey_number:$('ownerJersey').value ? Number($('ownerJersey').value) : null,user_id:user.id}); if(playerError) throw playerError; } toast(`Team created. Invite code: ${team.join_code}`); await loadWorkspace(user); } catch(err) { fail(err); } finally { setBusy(f,false); } });
$('joinTeamForm').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; setBusy(f,true); try { const code=$('joinCode').value.trim(); const { data: teamId,error }=await supabase.rpc('join_team',{p_join_code:code}); if(error) throw error; const { error: playerError }=await supabase.from('players').insert({team_id:teamId,display_name:$('joinPlayerName').value.trim(),jersey_number:$('joinJersey').value ? Number($('joinJersey').value) : null,user_id:state.user.id}); if(playerError) throw playerError; await loadWorkspace(state.user); } catch(err) { fail(err); } finally { setBusy(f,false); } });

$('matchForm').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; setBusy(f,true); try { const starts=$('matchTime').value ? new Date($('matchTime').value).toISOString() : null; const {error}=await supabase.from('matches').insert({team_id:state.team.id,home_team:$('homeTeam').value.trim(),away_team:$('awayTeam').value.trim(),starts_at:starts,venue:$('matchVenue').value.trim()||null,tags:$('matchTags').value.split(',').map(x=>x.trim()).filter(Boolean),status:'upcoming'}); if(error) throw error; f.reset(); f.closest('dialog').close(); await refreshData(); toast('Match added.'); } catch(err) { fail(err); } finally { setBusy(f,false); } });
$('playerForm').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; setBusy(f,true); try { const {error}=await supabase.from('players').insert({team_id:state.team.id,display_name:$('playerName').value.trim(),jersey_number:$('playerJersey').value ? Number($('playerJersey').value) : null,position:$('playerPosition').value.trim()||null,bio:$('playerBio').value.trim()||null,user_id:$('linkPlayerAccount').checked ? state.user.id : null}); if(error) throw error; f.reset(); f.closest('dialog').close(); await refreshData(); toast('Player added.'); } catch(err) { fail(err); } finally { setBusy(f,false); } });
$('eventForm').addEventListener('submit', async e => { e.preventDefault(); const f=e.currentTarget; setBusy(f,true); try { const matchId=$('eventMatch').value, match=state.matches.find(m=>m.id===matchId); if(!match) throw new Error('Choose a match first.'); const type=$('eventType').value, clip=$('eventVideo').files[0]; let videoPath=null; if(clip) { if(clip.size>50*1024*1024) throw new Error('Video clips must be 50 MB or smaller.'); videoPath=`${state.team.id}/${matchId}/${crypto.randomUUID()}-${clip.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; const {error}=await supabase.storage.from('game-clips').upload(videoPath,clip,{contentType:clip.type,upsert:false}); if(error) throw error; } const {error}=await supabase.from('match_events').insert({team_id:state.team.id,match_id:matchId,player_id:$('eventPlayer').value||null,event_type:type,points:points(type),team_side:points(type)?$('eventSide').value:'home',period:Number($('eventPeriod').value)||null,game_clock:$('eventClock').value.trim()||null,tags:$('eventTags').value.split(',').map(x=>x.trim()).filter(Boolean),description:$('eventDescription').value.trim()||null,video_url:videoPath,created_by:state.user.id}); if(error) { if(videoPath) await supabase.storage.from('game-clips').remove([videoPath]); throw error; } f.reset(); $('eventPeriod').value='1'; f.closest('dialog').close(); await refreshData(); toast('Play logged and score updated.'); } catch(err) { fail(err); } finally { setBusy(f,false); } });

initialize().catch(fail);

