'use strict';
if (window.CanvasFrameDesktop) {
  window.CanvasFrameDesktop.onExportStatus(({ state, filename }) => {
    if (state === 'completed') exportMessage('Saved: ' + filename);
    else if (state === 'cancelled') exportMessage('Save cancelled.');
    else exportMessage('The export could not be saved. Try another location.');
  });
}
(function () {
  const bridge = window.CanvasFrameDesktop;
  if (!bridge?.onUpdateStatus) return;
  const banner = document.createElement('aside');
  banner.id = 'frame-update-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;max-width:390px;padding:12px;background:#edf4f8;color:#142d3a;border:1px solid #9fb6c7;border-radius:8px;box-shadow:0 8px 24px #102c3a33;font:13px system-ui;display:none';
  const info = document.createElement('div'), actions = document.createElement('div');
  const commands = document.createElement('div');
  const show = text => { info.textContent = text; banner.style.display = 'block'; };
  const button = (text, action) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.style.cssText = 'margin:5px 5px 0 0;padding:5px 10px;cursor:pointer';
    b.onclick = async () => {
      b.disabled = true;
      try { await action(); }
      catch (error) { show(String(error?.message || error).slice(0, 240)); }
      finally { b.disabled = false; }
    };
    return b;
  };
  const check = button('Check for updates', () => bridge.checkUpdate());
  commands.append(check, button('Dismiss', () => { banner.style.display = 'none'; }));
  banner.append(info, actions, commands); document.body.append(banner);
  function available(info) {
    if (!info?.available) return;
    if (info.notes?.length) {
      const list = document.createElement('ul'); list.style.cssText = 'margin:6px 0;padding-left:20px';
      for (const note of info.notes) { const li = document.createElement('li'); li.textContent = note; list.append(li); }
      actions.append(list);
    }
    if (info.readMore) actions.append(button('Read more', () => bridge.openReleaseInfo(info.readMore)));
    actions.append(button('Download', () => bridge.downloadUpdate()));
  }
  function render(s) {
    if (!s) return;
    check.disabled = ['downloading', 'downloaded', 'installing'].includes(s.state);
    if (s.state === 'checking' && !s.manual) return;
    actions.replaceChildren();
    if (s.state === 'checking') show('Checking for Frame Builder updates...');
    else if (s.state === 'available') {
      show('Installed ' + s.info.installedVersion + ' | Available ' + s.info.latestVersion);
      available(s.info);
    } else if (s.state === 'downloading') show('Downloading and verifying: ' + s.percent + '%');
    else if (s.state === 'downloaded') {
      show('Installed ' + s.installedVersion + ' | ' + s.version + ' is ready to install.');
      actions.append(button('Install and restart', () => bridge.installUpdate()));
    } else if (s.state === 'installing') show('Preparing the verified update...');
    else if (s.state === 'install-error') {
      show(s.message);
      if (s.retry) actions.append(button('Install and restart', () => bridge.installUpdate()));
    } else if (s.state === 'download-error') {
      show('Download failed: ' + s.message); available(s.info);
    } else if (s.state === 'error') {
      show(s.message + '. Online status is unknown.'); available(s.cachedInfo);
    } else if (s.state === 'cooldown') {
      const when = s.retryAfter ? ' Try again after ' + new Date(s.retryAfter).toLocaleTimeString() + '.' : '';
      show('Update check is temporarily limited.' + when); available(s.cachedInfo);
    } else if (s.state === 'current') {
      if (s.manual) show('Frame Builder ' + s.info.installedVersion + ' is up to date. Checked online.');
      else banner.style.display = 'none';
    } else if (s.state === 'installed') show('Frame Builder ' + s.version + ' installed successfully.');
  }
  bridge.onUpdateStatus(render);
  bridge.getUpdateStatus().then(render).catch(() => {});
})();
