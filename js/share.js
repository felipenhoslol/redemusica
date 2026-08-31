// Social Share card generator (HTML5 Canvas) and Spotify/Text export

/**
 * Generate a text list of all answered songs (easy for Spotify / sharing)
 * @param {object} profile 
 * @param {Array} questions 
 * @param {object} answers 
 * @returns {string}
 */
export function generateTextPlaylist(profile, questions, answers) {
  const answeredCount = Object.keys(answers).length;
  let text = `🎵 Desafio Music Ask 30 Dias — ${profile.name}\n`;
  text += `📊 Progresso: ${answeredCount}/${questions.length} músicas\n`;
  text += `═══════════════════════════════════════\n\n`;

  questions.forEach((q, idx) => {
    const song = answers[q.id];
    const num = String(idx + 1).padStart(2, '0');
    if (song) {
      text += `${num}. [${q.title}]\n   ▶ ${song.title} — ${song.artist}\n`;
      if (song.userNote) {
        text += `   💬 "${song.userNote}"\n`;
      }
    } else {
      text += `${num}. [${q.title}]\n   ⏳ (Pendente)\n`;
    }
    text += `\n`;
  });

  text += `═══════════════════════════════════════\nFeito no Music Ask App 🎧`;
  return text;
}

/**
 * Helper to load an image for canvas rendering
 * @param {string} src 
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback placeholder image
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = () => reject(new Error('Image failed'));
      fallback.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#1a1d2e"/>
          <text x="50%" y="50%" fill="#a0aec0" font-size="40" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">🎵</text>
        </svg>
      `);
    };
    img.src = src;
  });
}

/**
 * Render an Instagram Story (1080x1920) or Feed Square (1080x1080) Poster on Canvas
 * @param {HTMLCanvasElement} canvas 
 * @param {object} profile 
 * @param {Array} questions 
 * @param {object} answers 
 * @param {string} format 'story' (9:16) | 'square' (1:1)
 */
export async function renderShareCanvas(canvas, profile, questions, answers, format = 'story') {
  const isStory = format === 'story';
  const width = 1080;
  const height = isStory ? 1920 : 1080;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0a0d18');
  bgGrad.addColorStop(0.5, '#121629');
  bgGrad.addColorStop(1, '#080a12');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Background glow orbs
  ctx.save();
  const glow1 = ctx.createRadialGradient(200, 250, 50, 200, 250, 450);
  glow1.addColorStop(0, 'rgba(157, 78, 221, 0.28)');
  glow1.addColorStop(1, 'rgba(157, 78, 221, 0)');
  ctx.fillStyle = glow1;
  ctx.beginPath();
  ctx.arc(200, 250, 450, 0, Math.PI * 2);
  ctx.fill();

  const glow2 = ctx.createRadialGradient(880, 800, 50, 880, 800, 500);
  glow2.addColorStop(0, 'rgba(0, 242, 254, 0.22)');
  glow2.addColorStop(1, 'rgba(0, 242, 254, 0)');
  ctx.fillStyle = glow2;
  ctx.beginPath();
  ctx.arc(880, 800, 500, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Header Box
  ctx.save();
  const headerY = 80;
  
  // App Brand
  ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#00f2fe';
  ctx.fillText('MUSIC ASK', 80, headerY + 40);

  ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#8f9bb3';
  ctx.fillText('DESAFIO MUSICAL 30 DIAS', 80, headerY + 75);

  // User Profile Pill
  const userBoxWidth = 440;
  const userBoxHeight = 80;
  const userBoxX = width - 80 - userBoxWidth;
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  roundRect(ctx, userBoxX, headerY + 10, userBoxWidth, userBoxHeight, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Avatar emoji
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(profile.avatar || '🎧', userBoxX + 45, headerY + 62);

  // User Name & Progress
  const answeredCount = Object.keys(answers).length;
  ctx.textAlign = 'left';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(profile.name, userBoxX + 90, headerY + 45);

  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#00f5d4';
  ctx.fillText(`${answeredCount} de ${questions.length} faixas selecionadas`, userBoxX + 90, headerY + 72);
  ctx.restore();

  // 3. Grid of selected songs
  // In Story mode we can display top 12 or 16 nicely spaced items or a compact 30 items
  const itemsToShow = isStory ? questions.slice(0, 15) : questions.slice(0, 8);
  const startY = 220;

  // Render list or cards
  const cardHeight = isStory ? 95 : 85;
  const cardGap = isStory ? 14 : 12;

  for (let i = 0; i < itemsToShow.length; i++) {
    const q = itemsToShow[i];
    const song = answers[q.id];
    const itemY = startY + (i * (cardHeight + cardGap));

    // Card background
    ctx.save();
    ctx.fillStyle = 'rgba(20, 25, 45, 0.7)';
    roundRect(ctx, 80, itemY, width - 160, cardHeight, 16);
    ctx.fill();
    ctx.strokeStyle = song ? 'rgba(0, 242, 254, 0.3)' : 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number index badge
    const badgeGrad = ctx.createLinearGradient(95, itemY + 15, 95 + 40, itemY + 55);
    badgeGrad.addColorStop(0, '#9d4edd');
    badgeGrad.addColorStop(1, '#00f2fe');
    ctx.fillStyle = badgeGrad;
    roundRect(ctx, 95, itemY + 18, 38, 38, 10);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, 114, itemY + 43);

    // Album art thumbnail
    const thumbX = 145;
    const thumbY = itemY + 12;
    const thumbSize = cardHeight - 24;

    if (song && song.artwork) {
      try {
        const coverImg = await loadImage(song.artwork);
        ctx.save();
        roundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 10);
        ctx.clip();
        ctx.drawImage(coverImg, thumbX, thumbY, thumbSize, thumbSize);
        ctx.restore();
      } catch (err) {
        drawFallbackThumb(ctx, thumbX, thumbY, thumbSize);
      }
    } else {
      drawFallbackThumb(ctx, thumbX, thumbY, thumbSize);
    }

    // Text content
    const textStartX = thumbX + thumbSize + 20;
    const maxTextWidth = width - 160 - textStartX - 20;

    ctx.textAlign = 'left';

    // Question title
    ctx.font = '600 19px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#8f9bb3';
    ctx.fillText(truncateText(ctx, `${q.icon} ${q.title}`, maxTextWidth), textStartX, itemY + 36);

    // Song info
    if (song) {
      ctx.font = '700 23px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(truncateText(ctx, `${song.title} — ${song.artist}`, maxTextWidth), textStartX, itemY + 68);
    } else {
      ctx.font = 'italic 500 21px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillText('Nenhuma música escolhida ainda', textStartX, itemY + 68);
    }

    ctx.restore();
  }

  // 4. Footer Brand
  ctx.save();
  const footerY = height - 70;
  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('🎧 Crie sua lista no Music Ask • Compartilhe com seus amigos', width / 2, footerY);
  ctx.restore();
}

function drawFallbackThumb(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, x, y, size, size, 10);
  ctx.fill();
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🎵', x + size / 2, y + size / 2 + 10);
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
