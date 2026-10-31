import React, { useEffect, useState } from 'react';

/** <img> that quietly falls back to `fallback` when the picture is missing or fails to load. */
export const SafeImage = ({ src, alt, fallback = null, ...rest }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return fallback;
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} {...rest} />;
};
