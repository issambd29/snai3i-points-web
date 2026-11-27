// Calendar dates as YYYY-MM-DD in the user's LOCAL time zone.
// (`new Date().toISOString()` is UTC, which flips to the wrong day around midnight.)

const pad = (n) => String(n).padStart(2, '0');

export const toDateString = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayString = () => toDateString(new Date());

export const shiftDateString = (dateString, days) => {
  const [y, m, d] = dateString.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + days));
};

export const formatTime = (isoString) => {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (isoString) => {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
