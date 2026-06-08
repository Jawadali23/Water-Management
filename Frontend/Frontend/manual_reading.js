document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('openExcelBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API}/api/open-excel`);
      if (!res.ok) throw new Error('Network response was not ok');
      console.log('Open-excel request sent');
    } catch (err) {
      console.error('Failed to open excel:', err);
      alert('Unable to open manual meter entry. Check the server.');
    }
  });
});