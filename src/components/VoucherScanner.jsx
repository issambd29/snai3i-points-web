import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useApp } from '../context/AppContext';
import { SafeImage } from './SafeImage';
import { ScanLine, Camera, CheckCircle2, XCircle, Coins, Gift, RotateCcw, Keyboard } from 'lucide-react';

/**
 * Branch manager / admin screen: scan the student's QR voucher, see what it is for,
 * and confirm the hand-over. The server decides whether the voucher is valid for this
 * branch and marks it used, so a voucher can never be redeemed twice.
 */

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '');

export const VoucherScanner = () => {
  const { lookupVoucher, redeemVoucher } = useApp();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [order, setOrder] = useState(null); // looked-up voucher
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // redeemed voucher + message

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const resolve = useCallback(
    async (raw) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLooking(true);
      setError('');
      const res = await lookupVoucher(raw);
      setLooking(false);
      if (res.success) {
        setOrder(res.order);
        setCode(res.order.voucherCode);
      } else {
        setOrder(null);
        setError(res.error || 'Could not read this voucher.');
      }
      busyRef.current = false;
    },
    [lookupVoucher]
  );

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (hit?.data) {
        stopCamera();
        resolve(hit.data);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [resolve, stopCamera]);

  const startCamera = async () => {
    setCameraError('');
    setError('');
    setOrder(null);
    setDone(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot open the camera. Paste the voucher code below instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      // wait for the <video> element to be on screen
      requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play().catch(() => {});
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch (err) {
      stopCamera();
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site, or paste the voucher code below.'
          : 'Could not open the camera. Paste the voucher code below instead.'
      );
    }
  };

  const reset = () => {
    setOrder(null);
    setDone(null);
    setError('');
    setCode('');
    setManualCode('');
    startCamera();
  };

  const confirm = async () => {
    if (!order || confirming) return;
    setConfirming(true);
    const res = await redeemVoucher(code);
    setConfirming(false);
    if (res.success) {
      setDone(res.order);
      setOrder(null);
    } else {
      setError(res.error || 'Could not confirm this voucher.');
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      stopCamera();
      resolve(manualCode);
    }
  };

  const showCard = order || done;
  const card = done || order;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* CAMERA / START */}
      {!showCard && (
        <div className="table-card" style={{ padding: 18, textAlign: 'center' }}>
          {scanning ? (
            <>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#0b0b17',
                  aspectRatio: '1 / 1',
                  maxHeight: 420,
                  margin: '0 auto',
                }}
              >
                <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div
                  style={{
                    position: 'absolute',
                    inset: '18%',
                    border: '3px solid #F2A807',
                    borderRadius: 16,
                    boxShadow: '0 0 0 999px rgba(0,0,0,0.35)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, margin: '12px 0' }}>
                Point the camera at the student's QR voucher…
              </p>
              <button type="button" className="add-btn" onClick={stopCamera} style={{ background: '#64748b', boxShadow: 'none' }}>
                Stop camera
              </button>
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          ) : (
            <>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: 'rgba(242,168,7,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '4px auto 12px',
                }}
              >
                <ScanLine className="w-8 h-8" style={{ color: '#F2A807' }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--navy)' }}>Scan a reward voucher</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 16px' }}>
                Ask the student to show the QR code on their phone. You will see the reward and confirm the hand-over.
              </p>
              <button type="button" className="add-btn" onClick={startCamera} style={{ gap: 6 }} disabled={looking}>
                <Camera className="w-4 h-4" /> {looking ? 'Checking…' : 'Open camera'}
              </button>
            </>
          )}

          {cameraError && (
            <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 600, color: '#b45309' }}>{cameraError}</div>
          )}

          {/* manual fallback */}
          <form onSubmit={submitManual} style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Keyboard
                className="w-4 h-4"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
              />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="…or type the voucher code"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
            </div>
            <button type="submit" className="add-btn" disabled={!manualCode.trim() || looking} style={{ boxShadow: 'none' }}>
              Check
            </button>
          </form>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                textAlign: 'left',
              }}
            >
              <XCircle className="w-4 h-4" style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
        </div>
      )}

      {/* VOUCHER DETAILS + CONFIRM */}
      {showCard && (
        <div className="table-card" style={{ padding: 18 }}>
          {done && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                color: '#15803d',
                fontWeight: 800,
                fontSize: 14,
                marginBottom: 14,
              }}
            >
              <CheckCircle2 className="w-5 h-5" /> Handed over successfully
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 14,
                background: 'rgba(242,168,7,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <SafeImage
                src={card.productImage}
                alt={card.productName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={<Gift className="w-8 h-8" style={{ color: '#F2A807' }} />}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--navy)' }}>{card.productName}</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 800,
                  fontSize: 13,
                  color: '#d99206',
                  marginTop: 2,
                }}
              >
                <Coins className="w-4 h-4" /> {card.costCoins} coins
              </div>
            </div>
          </div>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '8px 16px',
              margin: '16px 0',
              fontSize: 13,
            }}
          >
            <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Student</dt>
            <dd style={{ margin: 0, fontWeight: 800 }}>{card.studentName}</dd>
            <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Class</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{card.studentClass}</dd>
            {card.branch && (
              <>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Branch</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{card.branch}</dd>
              </>
            )}
            <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Requested</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{fmtDate(card.createdAt)}</dd>
            {done && (
              <>
                <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Handed over</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{fmtDate(card.redeemedAt || card.completedAt)}</dd>
              </>
            )}
          </dl>

          {!done && order && !order.canRedeem && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {order.status === 'delivered' || order.status === 'completed'
                ? `This voucher was already used${order.completedAt ? ` on ${fmtDate(order.completedAt)}` : ''}.`
                : `This request is ${order.status}, so it cannot be handed over.`}
            </div>
          )}

          {error && (
            <div role="alert" style={{ color: '#b91c1c', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!done && order?.canRedeem && (
              <button type="button" className="add-btn" onClick={confirm} disabled={confirming} style={{ gap: 6 }}>
                <CheckCircle2 className="w-4 h-4" /> {confirming ? 'Confirming…' : 'Confirm hand-over'}
              </button>
            )}
            <button
              type="button"
              className="add-btn"
              onClick={reset}
              style={{ gap: 6, background: '#64748b', boxShadow: 'none' }}
            >
              <RotateCcw className="w-4 h-4" /> {done ? 'Scan next voucher' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoucherScanner;
