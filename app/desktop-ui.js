'use strict';
if (window.CanvasFrameDesktop) {
  window.CanvasFrameDesktop.onExportStatus(({ state, filename }) => {
    if (state === 'completed') exportMessage('Saved: ' + filename);
    else if (state === 'cancelled') exportMessage('Save cancelled.');
    else exportMessage('The export could not be saved. Try another location.');
  });
}

// A small notification independent of the offline CAD builder and its settings.
(function () {
  const bridge = window.CanvasFrameDesktop;
  if (!bridge?.onUpdateStatus) return;
  const banner = document.createElement('aside');
  banner.id = 'frame-update-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;max-width:410px;'+
    'padding:12px;background:#edf4f8;color:#142d3a;border:1px solid #9fb6c7;border-radius:8px;'+
    'box-shadow:0 8px 24px #102c3a33;font:13px system-ui;display:none';
  const info = document.createElement('div');
  const actions = document.createElement('div');
  actions.style.marginTop = '6px';
  const commands = document.createElement('div');
  const show = message => { info.textContent = message; banner.style.display = 'block'; };
  const errorText = e => String(e?.message || e || 'Unknown error').slice(0, 240);
  const button = (label, callback) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.style.cssText = 'margin:5px 5px 0 0;padding:5px 10px;cursor:pointer';
    element.addEventListener('click', async () => {
      element.disabled = true;
      try { await callback(); }
      catch (error) { show(label + ' failed: ' + errorText(error)); }
      finally { element.disabled = false; }
    });
    return element;
  };
  const check = button('Check again', () => bridge.checkUpdate());
  const close = button('Dismiss', () => { banner.style.display = 'none'; });
  commands.append(check, close);
  banner.append(info, actions, commands);
  document.body.append(banner);
  bridge.onUpdateStatus(state => {
    actions.replaceChildren();
    if (state.state === 'checking') {
      show('Checking for Frame Builder updates...');
      return;
    }
    if (state.state === 'available') {
      show('Frame Builder ' + state.info.installedVersion + ' | Update ' + state.info.latestVersion + ' available');
      if (state.info.notes?.length) {
        const list = document.createElement('ul');
        list.style.cssText = 'margin:6px 0;padding-left:20px';
        for (const note of state.info.notes) {
          const item = document.createElement('li');
          item.textContent = note;
          list.append(item);
        }
        actions.append(list);
      }
      if (state.info.readMore) {
        actions.append(button('Read more', () => bridge.openReleaseInfo(state.info.readMore)));
      }
      actions.append(button('Download', () => bridge.downloadUpdate()));
    } else if (state.state === 'downloading') {
      show('Downloading and verifying update: ' + state.percent + '%');
    } else if (state.state === 'downloaded') {
      show('Frame Builder ' + (state.version || '') + ' is verified and ready to install');
      actions.append(button('Install and restart', () => bridge.installUpdate()));
    } else if (state.state === 'error') {
      show(state.message || 'Unable to check for updates; last status is unknown');
    } else if (state.state === 'current') {
      show('Frame Builder ' + state.info.installedVersion + ' is up to date (checked online)');
    } else if (state.state === 'cooldown') {
      show('Update check is temporarily limited; try again later');
    }
  });
})();
