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
  let text = `Desafio das 30 músicas, de ${profile.name}\n`;
  text += `Progresso: ${answeredCount}/${questions.length} músicas\n`;
  text += `═══════════════════════════════════════\n\n`;

  questions.forEach((q, idx) => {
    const song = answers[q.id];
    const num = String(idx + 1).padStart(2, '0');
    if (song) {
      text += `${num}. [${q.title}]\n   ▶ ${song.title} — ${song.artist}\n`;
      if (song.userNote) {
        text += `   "${song.userNote}"\n`;
      }
    } else {
      text += `${num}. [${q.title}]\n   (Pendente)\n`;
    }
    text += `\n`;
  });

  text += `═══════════════════════════════════════\nFeito na rede de música`;
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
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#1a1d2e"/>
          <circle cx="100" cy="100" r="40" fill="none" stroke="#a0aec0" stroke-width="8"/>
          <circle cx="100" cy="100" r="14" fill="#a0aec0"/>
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
  ctx.font = '800 36px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = '#00f2fe';
  ctx.fillText('rede de música', 80, headerY + 40);

  ctx.font = '500 24px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = '#8f9bb3';
  ctx.fillText('Desafio das 30 músicas', 80, headerY + 75);

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

  // Avatar Initial
  ctx.font = '700 28px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const avatarLetter = (profile.avatar && !profile.avatar.startsWith('http') ? profile.avatar : (profile.name?.[0] || 'U')).slice(0, 2);
  ctx.fillText(avatarLetter, userBoxX + 45, headerY + 60);

  // User Name & Progress
  const answeredCount = Object.keys(answers).length;
  ctx.textAlign = 'left';
  ctx.font = '700 24px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(profile.name, userBoxX + 90, headerY + 45);

  ctx.font = '600 20px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = '#00f5d4';
  ctx.fillText(`${answeredCount} de ${questions.length} faixas selecionadas`, userBoxX + 90, headerY + 72);
  ctx.restore();

  // 3. Grid of selected songs (Adaptive layout filling canvas without empty space)
  const startY = isStory ? 200 : 180;
  const availableH = height - startY - 70;

  if (isStory) {
    // In Story mode (1920px height)
    const isTwoCol = questions.length > 15;
    const maxItems = isTwoCol ? 30 : 15;
    const itemsToShow = questions.slice(0, maxItems);
    const count = itemsToShow.length || 1;

    if (!isTwoCol) {
      const cardHeight = Math.min(100, Math.max(82, Math.floor((availableH - (count * 10)) / count)));
      const cardGap = Math.floor((availableH - (count * cardHeight)) / Math.max(1, count - 1));

      for (let i = 0; i < count; i++) {
        const q = itemsToShow[i];
        const song = answers[q.id];
        const itemY = startY + (i * (cardHeight + cardGap));
        await drawShareSongCard(ctx, q, song, i + 1, 80, itemY, width - 160, cardHeight, true);
      }
    } else {
      const colW = (width - 160 - 18) / 2;
      const rowsPerCol = Math.ceil(count / 2);
      const cardHeight = Math.min(88, Math.floor((availableH - (rowsPerCol * 10)) / rowsPerCol));
      const cardGap = Math.floor((availableH - (rowsPerCol * cardHeight)) / Math.max(1, rowsPerCol - 1));

      for (let i = 0; i < count; i++) {
        const q = itemsToShow[i];
        const song = answers[q.id];
        const col = i < rowsPerCol ? 0 : 1;
        const rowIdx = i < rowsPerCol ? i : (i - rowsPerCol);
        const cardX = 80 + col * (colW + 18);
        const cardY = startY + (rowIdx * (cardHeight + cardGap));
        await drawShareSongCard(ctx, q, song, i + 1, cardX, cardY, colW, cardHeight, false);
      }
    }
  } else {
    // In Square mode (1080px height)
    const isTwoCol = questions.length > 6;
    const maxItems = isTwoCol ? 12 : 6;
    const itemsToShow = questions.slice(0, maxItems);
    const count = itemsToShow.length || 1;

    if (!isTwoCol) {
      const cardHeight = Math.min(96, Math.max(78, Math.floor((availableH - (count * 8)) / count)));
      const cardGap = Math.floor((availableH - (count * cardHeight)) / Math.max(1, count - 1));

      for (let i = 0; i < count; i++) {
        const q = itemsToShow[i];
        const song = answers[q.id];
        const itemY = startY + (i * (cardHeight + cardGap));
        await drawShareSongCard(ctx, q, song, i + 1, 80, itemY, width - 160, cardHeight, true);
      }
    } else {
      const colW = (width - 160 - 16) / 2;
      const rowsPerCol = Math.ceil(count / 2);
      const cardHeight = Math.min(84, Math.floor((availableH - (rowsPerCol * 8)) / rowsPerCol));
      const cardGap = Math.floor((availableH - (rowsPerCol * cardHeight)) / Math.max(1, rowsPerCol - 1));

      for (let i = 0; i < count; i++) {
        const q = itemsToShow[i];
        const song = answers[q.id];
        const col = i < rowsPerCol ? 0 : 1;
        const rowIdx = i < rowsPerCol ? i : (i - rowsPerCol);
        const cardX = 80 + col * (colW + 16);
        const cardY = startY + (rowIdx * (cardHeight + cardGap));
        await drawShareSongCard(ctx, q, song, i + 1, cardX, cardY, colW, cardHeight, false);
      }
    }
  }

  // 4. Footer Brand
  ctx.save();
  const footerY = height - 40;
  ctx.font = '600 18px "M PLUS Rounded 1c", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('Monte a sua lista na rede de música', width / 2, footerY);
  ctx.restore();
}

async function drawShareSongCard(ctx, q, song, index, x, y, cardWidth, cardHeight, isSingleCol = true) {
  // Card background
  ctx.save();
  ctx.fillStyle = 'rgba(20, 25, 45, 0.72)';
  roundRect(ctx, x, y, cardWidth, cardHeight, 14);
  ctx.fill();
  ctx.strokeStyle = song ? 'rgba(0, 242, 254, 0.28)' : 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Number index badge
  const badgeSize = cardHeight > 80 ? 36 : 30;
  const badgeX = x + 12;
  const badgeY = y + (cardHeight - badgeSize) / 2;

  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeSize, badgeY + badgeSize);
  badgeGrad.addColorStop(0, '#9d4edd');
  badgeGrad.addColorStop(1, '#00f2fe');
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${cardHeight > 80 ? '16px' : '14px'} "M PLUS Rounded 1c", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${index}`, badgeX + (badgeSize / 2), badgeY + (badgeSize / 2) + 5);

  // Album art thumbnail
  const thumbSize = cardHeight - 20;
  const thumbX = badgeX + badgeSize + 10;
  const thumbY = y + 10;

  if (song && song.artwork) {
    try {
      const coverImg = await loadImage(song.artwork);
      ctx.save();
      roundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 8);
      ctx.clip();
      ctx.drawImage(coverImg, thumbX, thumbY, thumbSize, thumbSize);
      ctx.restore();
    } catch {
      drawFallbackThumb(ctx, thumbX, thumbY, thumbSize);
    }
  } else {
    drawFallbackThumb(ctx, thumbX, thumbY, thumbSize);
  }

  // Text content
  const textStartX = thumbX + thumbSize + 14;
  const maxTextWidth = cardWidth - (textStartX - x) - 14;

  ctx.textAlign = 'left';

  // Question title
  ctx.font = `600 ${cardHeight > 80 ? '17px' : '14px'} "M PLUS Rounded 1c", sans-serif`;
  ctx.fillStyle = '#8f9bb3';
  ctx.fillText(truncateText(ctx, `${q.title}`, maxTextWidth), textStartX, y + (cardHeight * 0.40));

  // Song info
  if (song) {
    ctx.font = `700 ${cardHeight > 80 ? '20px' : '16px'} "M PLUS Rounded 1c", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncateText(ctx, `${song.title} — ${song.artist}`, maxTextWidth), textStartX, y + (cardHeight * 0.74));
  } else {
    ctx.font = `italic 500 ${cardHeight > 80 ? '17px' : '14px'} "M PLUS Rounded 1c", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText('Pendente', textStartX, y + (cardHeight * 0.74));
  }

  ctx.restore();
}

function drawFallbackThumb(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, x, y, size, size, 10);
  ctx.fill();
  ctx.strokeStyle = '#a0aec0';
  ctx.lineWidth = 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#a0aec0';
  ctx.fill();
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
