/**
 * overlay-manager.js (Optical Image & Polar Overlay Engine)
 * 高保真样品光学照片与极坐标偏振图叠加渲染引擎
 * 针对二维材料/各向异性晶体科研：支持显微镜照片导入、滤镜调节、极坐标矢量渲染、画布交互拖拽对准与 4K 出版级图片导出
 */

class PolarOverlayManager {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.image = null;
    this.imageName = '';
    this.isSampleImage = false;
    this.polarData = null;

    // 图像与叠加参数
    this.imageFilters = {
      brightness: 100, // 50% - 150%
      contrast: 100,   // 50% - 200%
      grayscale: false,
      invert: false
    };

    this.currentPresetKey = 'real_pol';
    this.currentPresetSampleName = 'ReS₂ 晶体微片 (SiO₂/Si 基底)';

    this.overlayConfig = {
      offsetX: 0,      // 像素偏移（相对于画布/图片中心）
      offsetY: 0,
      scale: 0.38,     // 相对图像短边比例 (0.1 ~ 1.5)
      rotation: 0,     // 旋转对准角度 (度，-180 ~ 180)
      opacity: 0.88,   // 叠加不透明度 (0.1 ~ 1.0)
      mode: 'all',     // 'all' (拟合+点+误差带) | 'fit_only' (仅理论拟合) | 'points_only' (仅实测数据点)
      lineWidth: 2.5,  // 曲线线宽
      bgStyle: 'transparent', // 'transparent' | 'glass' | 'white' | 'dark'
      showGrid: true,  // 显示同心极坐标网格与角度射线
      showAxes: true,  // 显示 0°/90° 主轴
      showLabels: true, // 显示 0°, 90°, 180°, 270° 刻度标签
      showFastAxis: true, // 标出快轴方向射线
      showBadge: true, // 学术信息浮签 (θmax, ER, Sample)
      badgeCorner: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
      showReticle: true, // 微区准星与激光斑对准标尺 (助力精准定位样品晶片)
      dynamicRange: true, // 动态各向异性特征展开 (彻底解决基底大底噪将花瓣压成正圆的问题)
      theme: 'nature', // 'nature' | 'emerald' | 'science' | 'amber' | 'prl' | 'ieee' | 'dark_lab' | 'high_contrast' | 'platinum'
      customColor: '#2563eb'
    };

    // 交互拖拽、旋转与单点吸附状态
    this.isDragging = false;
    this.isRotating = false;
    this.rotateStartAngle = 0;
    this.rotateStartRot = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;
    this.hasDraggedMeaningfully = false;

    // 底图平移与缩放 (Pan & Zoom)
    this.imagePanX = 0;
    this.imagePanY = 0;
    this.imageZoom = 1.0;
    this.isPanningImage = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.panStartImgX = 0;
    this.panStartImgY = 0;

    // 回调通知
    this.onConfigChange = null;
    this.onImageLoaded = null;

    this.initCanvasEvents();
    // 核心重构：优先呈现极坐标图，严禁默认载入虚构底图，保持 this.image = null
    this.image = null;
    this.imageName = '';
    this.isSampleImage = false;
  }

  getPalette() {
    const theme = this.overlayConfig.theme || 'nature';
    const palettes = {
      nature: {
        fit: '#7c3aed', mean: '#dc2626', points: '#1d4ed8', errArea: 'rgba(220, 38, 38, 0.22)',
        grid: 'rgba(255, 255, 255, 0.45)', gridDark: 'rgba(15, 23, 42, 0.35)',
        text: '#ffffff', textDark: '#0f172a', fastAxis: '#10b981'
      },
      emerald: {
        fit: '#10b981', mean: '#f59e0b', points: '#06b6d4', errArea: 'rgba(16, 185, 129, 0.22)',
        grid: 'rgba(255, 255, 255, 0.55)', gridDark: 'rgba(16, 185, 129, 0.35)',
        text: '#ffffff', textDark: '#10b981', fastAxis: '#34d399'
      },
      science: {
        fit: '#4f46e5', mean: '#e11d48', points: '#0284c7', errArea: 'rgba(225, 29, 72, 0.22)',
        grid: 'rgba(255, 255, 255, 0.45)', gridDark: 'rgba(15, 23, 42, 0.35)',
        text: '#ffffff', textDark: '#0f172a', fastAxis: '#14b8a6'
      },
      amber: {
        fit: '#f59e0b', mean: '#ef4444', points: '#38bdf8', errArea: 'rgba(245, 158, 11, 0.22)',
        grid: 'rgba(255, 255, 255, 0.5)', gridDark: 'rgba(245, 158, 11, 0.3)',
        text: '#ffffff', textDark: '#f59e0b', fastAxis: '#fbbf24'
      },
      prl: {
        fit: '#9333ea', mean: '#b91c1c', points: '#2563eb', errArea: 'rgba(185, 28, 28, 0.22)',
        grid: 'rgba(255, 255, 255, 0.45)', gridDark: 'rgba(0, 0, 0, 0.4)',
        text: '#ffffff', textDark: '#000000', fastAxis: '#16a34a'
      },
      ieee: {
        fit: '#5c2d91', mean: '#cc0000', points: '#005596', errArea: 'rgba(204, 0, 0, 0.22)',
        grid: 'rgba(255, 255, 255, 0.45)', gridDark: 'rgba(17, 24, 39, 0.35)',
        text: '#ffffff', textDark: '#111827', fastAxis: '#00857c'
      },
      dark_lab: {
        fit: '#c084fc', mean: '#f87171', points: '#38bdf8', errArea: 'rgba(248, 113, 113, 0.25)',
        grid: 'rgba(255, 255, 255, 0.5)', gridDark: 'rgba(248, 250, 252, 0.4)',
        text: '#f8fafc', textDark: '#f8fafc', fastAxis: '#34d399'
      },
      high_contrast: {
        fit: '#00ffff', mean: '#ff0055', points: '#ffff00', errArea: 'rgba(255, 0, 85, 0.28)',
        grid: 'rgba(255, 255, 255, 0.65)', gridDark: 'rgba(0, 0, 0, 0.55)',
        text: '#ffffff', textDark: '#ffff00', fastAxis: '#00ff66'
      },
      platinum: {
        fit: '#ffffff', mean: '#38bdf8', points: '#a855f7', errArea: 'rgba(255, 255, 255, 0.2)',
        grid: 'rgba(255, 255, 255, 0.6)', gridDark: 'rgba(255, 255, 255, 0.4)',
        text: '#ffffff', textDark: '#ffffff', fastAxis: '#00f5ff'
      }
    };
    return palettes[theme] || palettes.nature;
  }

  stepRotation(delta) {
    let newRot = Math.round((this.overlayConfig.rotation || 0) + delta);
    while (newRot > 180) newRot -= 360;
    while (newRot < -180) newRot += 360;
    this.overlayConfig.rotation = newRot;
    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
    this.render();
  }

  setRotation(angle) {
    let newRot = Math.round(angle);
    while (newRot > 180) newRot -= 360;
    while (newRot < -180) newRot += 360;
    this.overlayConfig.rotation = newRot;
    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
    this.render();
  }

  setBadgeCorner(corner) {
    this.overlayConfig.badgeCorner = corner;
    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
    this.render();
  }

  initCanvasEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

    // 滚轮缩放：Ctrl+滚轮缩放底图，Shift+滚轮旋转极坐标，默认滚轮缩放极坐标
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.image && e.ctrlKey) {
        // Ctrl + 滚轮平滑缩放底图
        const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
        this.imageZoom = Math.max(0.1, Math.min(6.0, parseFloat(((this.imageZoom || 1.0) + zoomDelta).toFixed(3))));
        this.render();
      } else if (e.shiftKey) {
        // Shift + 滚轮平滑旋转对齐晶棱
        const rotDelta = e.deltaY < 0 ? 1 : -1;
        this.stepRotation(rotDelta);
      } else {
        const delta = e.deltaY < 0 ? 0.03 : -0.03;
        const newScale = Math.max(0.1, Math.min(1.5, this.overlayConfig.scale + delta));
        this.overlayConfig.scale = parseFloat(newScale.toFixed(3));
        if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
        this.render();
      }
    }, { passive: false });

    // 拖拽文件进入画布直接加载
    const container = this.canvas.parentElement;
    if (container) {
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
      });
      container.addEventListener('dragleave', () => {
        container.classList.remove('drag-over');
      });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.loadImageFromFile(e.dataTransfer.files[0]);
        }
      });
    }
  }

  handleMouseDown(e) {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const rw = rect.width || this.canvas.width || 800;
    const rh = rect.height || this.canvas.height || 600;
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rw);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rh);
    const centerX = this.canvas.width / 2 + this.overlayConfig.offsetX;
    const centerY = this.canvas.height / 2 + this.overlayConfig.offsetY;

    // 1. 中键拖拽或 Ctrl + 左键：平移底图 (Pan Background Image)
    if (this.image && (e.button === 1 || (e.button === 0 && e.ctrlKey))) {
      this.isPanningImage = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartImgX = this.imagePanX || 0;
      this.panStartImgY = this.imagePanY || 0;
      this.canvas.style.cursor = 'move';
      return;
    }

    // 2. Alt + 拖拽：原位环形旋转
    if (e.altKey) {
      this.isRotating = true;
      this.rotateStartAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
      this.rotateStartRot = this.overlayConfig.rotation;
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // 3. 普通左键：拖动极坐标图或点击吸附定位
    if (e.button === 0) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartOffsetX = this.overlayConfig.offsetX;
      this.dragStartOffsetY = this.overlayConfig.offsetY;
      this.hasDraggedMeaningfully = false;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  handleMouseMove(e) {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const rw = rect.width || this.canvas.width || 800;
    const rh = rect.height || this.canvas.height || 600;
    const scaleFactorX = this.canvas.width / rw;
    const scaleFactorY = this.canvas.height / rh;
    const mouseX = (e.clientX - rect.left) * scaleFactorX;
    const mouseY = (e.clientY - rect.top) * scaleFactorY;
    const centerX = this.canvas.width / 2 + this.overlayConfig.offsetX;
    const centerY = this.canvas.height / 2 + this.overlayConfig.offsetY;

    // 1. 底图平移中
    if (this.isPanningImage) {
      const dx = (e.clientX - this.panStartX) * scaleFactorX;
      const dy = (e.clientY - this.panStartY) * scaleFactorY;
      this.imagePanX = Math.round(this.panStartImgX + dx);
      this.imagePanY = Math.round(this.panStartImgY + dy);
      this.render();
      return;
    }

    // 2. 旋转中
    if (this.isRotating) {
      const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
      const diffDeg = ((currentAngle - this.rotateStartAngle) * 180) / Math.PI;
      let newRot = Math.round(this.rotateStartRot - diffDeg);
      while (newRot > 180) newRot -= 360;
      while (newRot < -180) newRot += 360;
      this.overlayConfig.rotation = newRot;
      if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
      this.render();
      return;
    }

    // 3. 悬停光标状态
    if (!this.isDragging) {
      if (this.image && e.ctrlKey) {
        this.canvas.style.cursor = 'move';
      } else if (e.altKey) {
        this.canvas.style.cursor = 'alias';
      } else {
        const dist = Math.hypot(mouseX - centerX, mouseY - centerY);
        const polarRadius = Math.min(this.canvas.width, this.canvas.height) * this.overlayConfig.scale;
        this.canvas.style.cursor = dist <= polarRadius * 1.15 ? 'grab' : 'crosshair';
      }
      return;
    }

    // 4. 极坐标拖拽中
    const dx = (e.clientX - this.dragStartX) * scaleFactorX;
    const dy = (e.clientY - this.dragStartY) * scaleFactorY;

    if (Math.hypot(dx, dy) > 5) {
      this.hasDraggedMeaningfully = true;
    }

    this.overlayConfig.offsetX = Math.round(this.dragStartOffsetX + dx);
    this.overlayConfig.offsetY = Math.round(this.dragStartOffsetY + dy);

    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
    this.render();
  }

  handleMouseUp(e) {
    if (this.isPanningImage) {
      this.isPanningImage = false;
      if (this.canvas) this.canvas.style.cursor = 'grab';
      return;
    }

    if (this.isRotating) {
      this.isRotating = false;
      if (this.canvas) this.canvas.style.cursor = 'grab';
      return;
    }

    if (this.isDragging) {
      // 点选吸附定位 (Click-to-Locate):
      if (!this.hasDraggedMeaningfully && e && this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const rw = rect.width || this.canvas.width || 800;
        const rh = rect.height || this.canvas.height || 600;
        const scaleFactorX = this.canvas.width / rw;
        const scaleFactorY = this.canvas.height / rh;
        const clickCanvasX = (e.clientX - rect.left) * scaleFactorX;
        const clickCanvasY = (e.clientY - rect.top) * scaleFactorY;
        
        this.overlayConfig.offsetX = Math.round(clickCanvasX - this.canvas.width / 2);
        this.overlayConfig.offsetY = Math.round(clickCanvasY - this.canvas.height / 2);
        if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
        this.render();
      }
      this.isDragging = false;
      if (this.canvas) this.canvas.style.cursor = 'grab';
    }
  }

  /**
   * 从文件（File/Blob）载入光学图像
   */
  loadImageFromFile(file) {
    if (!file) return;

    const isImage = (file.type && file.type.startsWith('image/')) ||
      /\.(png|jpe?g|webp|bmp|gif|svg|tif|tiff)$/i.test(file.name || '');

    if (!isImage) {
      alert('请选择有效的图像文件 (支持 PNG, JPG, WebP, BMP 等格式)');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      console.error('读取图像文件失败:', file.name);
      alert('读取图像文件失败，请检查文件权限或重试。');
    };
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.imageName = file.name;
        this.isSampleImage = false;
        this.resetOverlayPosition();
        this.resize();
        this.render();
        const w = img.naturalWidth || img.width || 1200;
        const h = img.naturalHeight || img.height || 900;
        if (this.onImageLoaded) this.onImageLoaded(file.name, w, h, dataUrl);
      };
      img.onerror = () => {
        console.error('图像解码失败:', file.name);
        alert(`无法解码图像文件 "${file.name}"。\n如果该文件为 TIFF 或专业显微镜专有格式，请先另存为 PNG 或 JPG 格式后导入。`);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  /**
   * 载入内置的真实感二维材料显微镜示例图（支持多套件光学照片生成）
   */
  loadSampleMicrograph(type = 'real_pol', targetRotation = null) {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1200;
    sampleCanvas.height = 900;
    const sCtx = sampleCanvas.getContext('2d');

    let fileName = '2D_Crystal_Sample_100x.png';
    let sampleTitle = 'ReS₂ 晶体微片 (SiO₂/Si 基底)';

    if (type === 'ideal_hwp') {
      fileName = 'Quartz_Waveplate_Device_50x.png';
      sampleTitle = 'Quartz 晶体波片 (理想仿真)';
      // 蓝宝石基底与金属通光孔径
      const bgGrad = sCtx.createLinearGradient(0, 0, 1200, 900);
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(0.5, '#334155');
      bgGrad.addColorStop(1, '#0f172a');
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, 1200, 900);

      // 金属电极与圆形通光孔 (Clear aperture)
      sCtx.save();
      sCtx.translate(600, 450);
      sCtx.beginPath();
      sCtx.arc(0, 0, 260, 0, Math.PI * 2);
      sCtx.fillStyle = 'rgba(219, 234, 254, 0.15)';
      sCtx.fill();
      sCtx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      sCtx.lineWidth = 8;
      sCtx.stroke();

      // 精密石英双折射晶片 (快轴旋转 15°)
      sCtx.rotate((15 * Math.PI) / 180);
      sCtx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      sCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      sCtx.lineWidth = 2;
      sCtx.fillRect(-140, -140, 280, 280);
      sCtx.strokeRect(-140, -140, 280, 280);

      // 中心准直光束点
      sCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      sCtx.setLineDash([3, 3]);
      sCtx.beginPath();
      sCtx.arc(0, 0, 16, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.setLineDash([]);
      sCtx.fillStyle = '#ef4444';
      sCtx.beginPath();
      sCtx.arc(0, 0, 3, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.restore();

      // 标尺 10 μm
      const barX = 70, barY = 820, barLength = 160;
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(barX, barY, barLength, 6);
      sCtx.font = 'bold 18px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('10 μm', barX + barLength / 2, barY - 6);
      sCtx.font = '14px monospace';
      sCtx.textAlign = 'left';
      sCtx.fillText('Optical Device · Quartz Platelet · 50× Objective', barX, barY + 30);
    } else if (type === 'retardance_error') {
      fileName = 'Strained_2D_Flake_100x.png';
      sampleTitle = '应变各向异性薄片 (δ=165°)';
      // 具应力双折射条纹的基底
      const bgGrad = sCtx.createLinearGradient(0, 0, 1200, 900);
      bgGrad.addColorStop(0, '#312e81');
      bgGrad.addColorStop(0.5, '#3730a3');
      bgGrad.addColorStop(1, '#1e1b4b');
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, 1200, 900);

      // 应力双折射彩色干涉条纹轮廓
      for (let r = 80; r < 400; r += 60) {
        sCtx.strokeStyle = `rgba(244, 114, 182, ${0.35 - r / 1200})`;
        sCtx.lineWidth = 4;
        sCtx.beginPath();
        sCtx.ellipse(600, 450, r * 1.3, r * 0.8, Math.PI / 6, 0, Math.PI * 2);
        sCtx.stroke();
      }

      // 应变薄片
      sCtx.save();
      sCtx.translate(600, 450);
      sCtx.fillStyle = 'rgba(129, 140, 248, 0.55)';
      sCtx.strokeStyle = 'rgba(199, 210, 254, 0.6)';
      sCtx.lineWidth = 2;
      sCtx.beginPath();
      sCtx.moveTo(-160, -90);
      sCtx.lineTo(140, -110);
      sCtx.lineTo(190, 80);
      sCtx.lineTo(-30, 150);
      sCtx.lineTo(-170, 70);
      sCtx.closePath();
      sCtx.fill();
      sCtx.stroke();

      // 激光光斑
      sCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      sCtx.beginPath();
      sCtx.arc(0, 0, 15, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.fillStyle = '#ef4444';
      sCtx.beginPath();
      sCtx.arc(0, 0, 2.5, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.restore();

      const barX = 70, barY = 820, barLength = 120;
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(barX, barY, barLength, 6);
      sCtx.font = 'bold 18px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('5 μm', barX + barLength / 2, barY - 6);
      sCtx.font = '14px monospace';
      sCtx.textAlign = 'left';
      sCtx.fillText('Strained Flake Micrograph · 100× Objective · Birefringence Mismatch', barX, barY + 30);
    } else if (type === 'linear_drift') {
      fileName = 'Laser_InSitu_Drift_Sample.png';
      sampleTitle = '激光光热漂移样本';
      // 类似暗场基底
      sCtx.fillStyle = '#1e293b';
      sCtx.fillRect(0, 0, 1200, 900);

      sCtx.save();
      sCtx.translate(600, 450);
      // 热积聚扩散晕环
      const halo = sCtx.createRadialGradient(0, 0, 5, 0, 0, 180);
      halo.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
      halo.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = halo;
      sCtx.fillRect(-200, -200, 400, 400);

      // 二维薄片
      sCtx.rotate((11.5 * Math.PI) / 180);
      sCtx.fillStyle = 'rgba(100, 116, 139, 0.6)';
      sCtx.fillRect(-120, -90, 240, 180);
      sCtx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      sCtx.strokeRect(-120, -90, 240, 180);

      // 强热聚焦斑
      sCtx.fillStyle = '#f97316';
      sCtx.beginPath();
      sCtx.arc(0, 0, 6, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.restore();

      const barX = 70, barY = 820, barLength = 120;
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(barX, barY, barLength, 6);
      sCtx.font = 'bold 18px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('5 μm', barX + barLength / 2, barY - 6);
      sCtx.font = '14px monospace';
      sCtx.textAlign = 'left';
      sCtx.fillText('In-situ Photothermal Decay · 100× Objective', barX, barY + 30);
    } else {
      // 默认 real_pol: 经典 ReS2 纳米薄片在 SiO2/Si 基底上
      fileName = '2D_ReS2_Crystal_Sample_100x.png';
      sampleTitle = 'ReS₂ 晶体微片 (SiO₂/Si 基底)';
      // 1. 基底颜色：典型 300nm SiO2/Si 芯片在白光显微镜下的紫蓝调
      const bgGradient = sCtx.createLinearGradient(0, 0, 1200, 900);
      bgGradient.addColorStop(0, '#4a4878');
      bgGradient.addColorStop(0.5, '#545284');
      bgGradient.addColorStop(1, '#474574');
      sCtx.fillStyle = bgGradient;
      sCtx.fillRect(0, 0, 1200, 900);

      const vigGrad = sCtx.createRadialGradient(600, 450, 200, 600, 450, 750);
      vigGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      vigGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
      vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      sCtx.fillStyle = vigGrad;
      sCtx.fillRect(0, 0, 1200, 900);

      // 微观杂质点
      sCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      for (let i = 0; i < 40; i++) {
        const px = (i * 137.5) % 1200;
        const py = (i * 229.3) % 900;
        sCtx.beginPath();
        sCtx.arc(px, py, (i % 3 === 0) ? 2 : 1, 0, Math.PI * 2);
        sCtx.fill();
      }

      // 重点研究的主薄片 (ReS2 各向异性晶片，主轴解理夹角约 36°，数学笛卡尔坐标正向延伸)
      sCtx.save();
      sCtx.translate(600, 450);

      // 多层底层
      sCtx.fillStyle = 'rgba(92, 160, 148, 0.45)';
      sCtx.beginPath();
      sCtx.moveTo(-180, 110);
      sCtx.lineTo(130, 170);
      sCtx.lineTo(210, -70);
      sCtx.lineTo(20, -190);
      sCtx.lineTo(-140, -120);
      sCtx.closePath();
      sCtx.fill();

      // 主薄片（具有天然 36° 各向异性解理边界）
      sCtx.fillStyle = 'rgba(74, 118, 172, 0.65)';
      sCtx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.moveTo(-140, 70);
      sCtx.lineTo(95, 120);
      sCtx.lineTo(170, -50);
      sCtx.lineTo(10, -140);
      sCtx.lineTo(-115, -80);
      sCtx.closePath();
      sCtx.fill();
      sCtx.stroke();

      // 台阶
      sCtx.fillStyle = 'rgba(60, 90, 140, 0.4)';
      sCtx.beginPath();
      sCtx.moveTo(-115, -80);
      sCtx.lineTo(10, -140);
      sCtx.lineTo(-40, -175);
      sCtx.lineTo(-155, -110);
      sCtx.closePath();
      sCtx.fill();

      // 激光微区聚焦点
      sCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      sCtx.lineWidth = 1.2;
      sCtx.setLineDash([3, 3]);
      sCtx.beginPath();
      sCtx.arc(0, 0, 14, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.setLineDash([]);
      sCtx.beginPath();
      sCtx.arc(0, 0, 2.5, 0, Math.PI * 2);
      sCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      sCtx.fill();

      sCtx.restore();

      const barX = 70, barY = 820, barLength = 120;
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(barX, barY, barLength, 6);
      sCtx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'bottom';
      sCtx.shadowColor = 'rgba(0,0,0,0.8)';
      sCtx.shadowBlur = 4;
      sCtx.fillText('5 μm', barX + barLength / 2, barY - 6);
      sCtx.shadowBlur = 0;

      sCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      sCtx.font = '14px ui-monospace, monospace';
      sCtx.textAlign = 'left';
      sCtx.fillText('Optical Micrograph · 100× Objective · SiO₂/Si (300nm) · ReS₂ Flake', barX, barY + 30);
    }

    this.currentPresetSampleName = sampleTitle;

    const dataUrl = sampleCanvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.imageName = fileName;
      this.isSampleImage = true;
      this.imagePanX = 0;
      this.imagePanY = 0;
      this.imageZoom = 1.0;
      this.overlayConfig.offsetX = 0;
      this.overlayConfig.offsetY = 0;
      if (targetRotation !== null && targetRotation !== undefined) {
        this.overlayConfig.rotation = targetRotation;
      }
      this.resize();
      this.render();
      if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
      if (this.onImageLoaded) this.onImageLoaded(this.imageName, img.width, img.height, dataUrl);
    };
    img.src = dataUrl;
  }

  /**
   * 载入预设套件 (Preset Bundle)：偏振数据配置与可选联动光学照片
   * 默认 autoLoadImage = false: 极坐标优先呈现，严禁自动强塞虚构参考底图
   */
  loadPresetBundle(presetKey, presetData, autoLoadImage = false) {
    this.currentPresetKey = presetKey || 'real_pol';
    const presets = typeof PolarizationPresets !== 'undefined' ? PolarizationPresets : null;
    const preset = presetData || (presets ? presets[presetKey] : null);
    const micro = preset?.micrograph || {};
    const targetRotation = micro.alignRotation !== undefined ? micro.alignRotation : 0;
    const targetScale = micro.defaultScale || 0.38;
    const targetDynamic = micro.dynamicRange !== undefined ? micro.dynamicRange : true;

    this.overlayConfig.rotation = targetRotation;
    this.overlayConfig.scale = targetScale;
    this.overlayConfig.dynamicRange = targetDynamic;
    this.overlayConfig.offsetX = 0;
    this.overlayConfig.offsetY = 0;
    if (micro.sampleName) {
      this.currentPresetSampleName = micro.sampleName;
    }

    // 仅在显式请求加载预设底图（如用户点击“预设联动图”按钮）时才载入内置显微镜底图
    if (autoLoadImage) {
      this.loadSampleMicrograph(micro.type || presetKey, targetRotation);
    } else {
      if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
      this.render();
    }
  }

  /**
   * 快速将极坐标中心对准目标样品薄片/激光斑微区并复位底图视野
   */
  locateOnTargetFlake() {
    this.overlayConfig.offsetX = 0;
    this.overlayConfig.offsetY = 0;
    this.imagePanX = 0;
    this.imagePanY = 0;
    this.imageZoom = 1.0;
    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
    this.render();
  }

  /**
   * 复位底图平移与缩放视野
   */
  resetImageView() {
    this.imagePanX = 0;
    this.imagePanY = 0;
    this.imageZoom = 1.0;
    this.render();
  }

  clearImage() {
    this.image = null;
    this.imageName = '';
    this.isSampleImage = false;
    this.imagePanX = 0;
    this.imagePanY = 0;
    this.imageZoom = 1.0;
    this.render();
    if (this.onImageLoaded) this.onImageLoaded('', 0, 0, null);
  }

  resetOverlayPosition() {
    this.overlayConfig.offsetX = 0;
    this.overlayConfig.offsetY = 0;
    this.overlayConfig.scale = 0.38;
    this.overlayConfig.rotation = 0;
    if (this.onConfigChange) this.onConfigChange(this.overlayConfig);
  }

  updateConfig(newConfig) {
    this.overlayConfig = { ...this.overlayConfig, ...newConfig };
    this.render();
  }

  updateFilters(newFilters) {
    this.imageFilters = { ...this.imageFilters, ...newFilters };
    this.render();
  }

  resize() {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 仅在视口容器实际可见且具有正宽高时才设置物理像素与内联尺寸，防止在隐藏状态被默认值锁死
    if (width > 0 && height > 0) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.render();
    }
  }

  /**
   * 核心重绘例程：高保真呈现极坐标图与按需叠加光学显微图
   * 极坐标图作为第一视觉主体优先呈现，无底图时配合科研暗室网格与学术浮签
   */
  render() {
    if (!this.canvas && typeof document !== 'undefined') {
      this.canvas = document.getElementById(this.canvasId);
      if (this.canvas) this.ctx = this.canvas.getContext('2d');
    }
    if (!this.canvas || !this.ctx) return;

    if (!this.canvas.width || !this.canvas.height) {
      this.resize();
    }

    const ctx = this.ctx;
    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;

    ctx.clearRect(0, 0, width, height);

    // 1. 底图层绘制
    if (!this.image) {
      // 未导入底图时：呈现高品质科研暗室网格与温和操作引导胶囊
      this.drawEmptyBackdrop(ctx, width, height);
    } else {
      // 绘制用户导入或按需加载的光学背景图（支持 Pan & Zoom 与专业滤镜）
      this.drawBackgroundImage(ctx, width, height);
    }

    // 2. 计算极坐标图中心坐标与物理半径（始终作为尊享主体呈现）
    const centerX = width / 2 + this.overlayConfig.offsetX;
    const centerY = height / 2 + this.overlayConfig.offsetY;
    const minDim = Math.min(width, height);
    const radius = minDim * this.overlayConfig.scale;

    // 3. 绘制极坐标图矢量图层 (无论有无底图，均完整高保真呈现)
    this.drawPolarPlot(ctx, centerX, centerY, radius);

    // 4. 绘制学术角标水印卡片（实时显示晶棱偏角、θmax、消光比、偏振度等）
    if (this.overlayConfig.showBadge) {
      this.drawAcademicBadge(ctx, width, height);
    }
  }

  drawEmptyBackdrop(ctx, width, height) {
    // 1. 深邃科研暗室微光渐变底色
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.15,
      width / 2, height / 2, Math.max(width, height) * 0.8
    );
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#070b14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. 细腻光学坐标毫米标尺暗网格
    const gridSize = 40;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 3. 次级精密点阵 (实验台氛围感)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const dotStep = 80;
    for (let x = dotStep / 2; x < width; x += dotStep) {
      for (let y = dotStep / 2; y < height; y += dotStep) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // 4. 顶部柔和磨砂信息胶囊（告知科研工作者当前为极坐标优先呈现，可随时导入显微图）
    ctx.save();
    const bannerText = '✨ 极坐标图已优先呈现 · 点击下方「导入光学图」或将图片拖入画布即可叠加比对';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textWidth = ctx.measureText(bannerText).width;
    const pillW = textWidth + 36;
    const pillH = 30;
    const pillX = (width - pillW) / 2;
    const pillY = 16;
    const r = 15;

    ctx.fillStyle = 'rgba(30, 41, 59, 0.78)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pillX + r, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bannerText, width / 2, pillY + pillH / 2);
    ctx.restore();
  }

  drawBackgroundImage(ctx, destWidth, destHeight) {
    const img = this.image;
    if (!img) return;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH || !Number.isFinite(imgW) || !Number.isFinite(imgH)) return;

    const dW = destWidth || this.canvas.width || 800;
    const dH = destHeight || this.canvas.height || 600;
    if (!dW || !dH || !Number.isFinite(dW) || !Number.isFinite(dH)) return;

    ctx.save();

    // 滤镜应用
    const b = this.imageFilters.brightness;
    const c = this.imageFilters.contrast;
    const filters = [];
    if (b !== 100) filters.push(`brightness(${b}%)`);
    if (c !== 100) filters.push(`contrast(${c}%)`);
    if (this.imageFilters.grayscale) filters.push('grayscale(100%)');
    if (this.imageFilters.invert) filters.push('invert(100%)');
    if (filters.length > 0) {
      ctx.filter = filters.join(' ');
    }

    // 等比包含缩放并居中铺满
    const imgAspect = imgW / imgH;
    const destAspect = dW / dH;

    let baseW, baseH, baseX, baseY;
    if (imgAspect > destAspect) {
      // 图像更宽，按宽度填满，高度等比并上下居中
      baseW = dW;
      baseH = dW / imgAspect;
      baseX = 0;
      baseY = (dH - baseH) / 2;
    } else {
      // 图像更高，按高度填满，宽度等比并左右居中
      baseH = dH;
      baseW = dH * imgAspect;
      baseX = (dW - baseW) / 2;
      baseY = 0;
    }

    // 应用底图平移与缩放 (Pan & Zoom)
    const zoom = Math.max(0.1, Math.min(6.0, this.imageZoom || 1.0));
    const panX = this.imagePanX || 0;
    const panY = this.imagePanY || 0;

    const centerX = baseX + baseW / 2 + panX;
    const centerY = baseY + baseH / 2 + panY;
    const drawW = baseW * zoom;
    const drawH = baseH * zoom;
    const drawX = centerX - drawW / 2;
    const drawY = centerY - drawH / 2;

    if (Number.isFinite(drawX) && Number.isFinite(drawY) && Number.isFinite(drawW) && Number.isFinite(drawH)) {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  }

  /**
   * 矢量极坐标渲染：支持马吕斯拟合曲线、离散点、误差阴影、同心圆标尺、快轴指示
   */
  drawPolarPlot(ctx, cx, cy, radius) {
    if (radius <= 5) return;

    const pal = this.getPalette();
    const cfg = this.overlayConfig;
    const rotRad = (cfg.rotation * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rotRad);

    // 1. 底板样式
    if (cfg.bgStyle === 'glass') {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (cfg.bgStyle === 'white') {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
    } else if (cfg.bgStyle === 'dark') {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fill();
    }

    // 2. 极坐标网格（同心圆与射线）
    if (cfg.showGrid) {
      this.drawPolarGrid(ctx, radius, pal);
    }

    // 设置整体透明度
    ctx.globalAlpha = cfg.opacity;

    // 3. 绘制误差阴影带 (Error Band)
    if (cfg.mode === 'all') {
      this.drawErrorBand(ctx, radius, pal);
    }

    // 4. 绘制马吕斯理论拟合曲线 (Dense Malus Curve)
    if ((cfg.mode === 'all' || cfg.mode === 'fit_only') && this.polarData?.polarFit?.denseFitCurve?.length) {
      this.drawFitCurve(ctx, radius, pal, cfg.lineWidth);
    }

    // 5. 绘制实验实测数据点与均值折线
    if (cfg.mode === 'all' || cfg.mode === 'points_only') {
      this.drawDataPoints(ctx, radius, pal);
    }

    // 6. 绘制快轴主轴 / 拟合最大值方向指示射线与角标牌 (θmax)
    const fitTheta = this.polarData?.polarFit?.params?.thetaMax ?? this.polarData?.polarFit?.params?.theta0 ?? this.polarData?.polarFit?.params?.theta0Deg;
    if (cfg.showFastAxis && fitTheta !== undefined && fitTheta !== null) {
      this.drawFastAxisIndicator(ctx, radius, pal);
    }

    // 7. 绘制极坐标角度刻度数字 (0°, 90°, 180°, 270°)
    if (cfg.showLabels) {
      this.drawAngleLabels(ctx, radius, pal);
    }

    // 8. 绘制瞄准十字准星与微区定位靶环 (Reticle)
    if (cfg.showReticle) {
      this.drawTargetReticle(ctx, pal);
    }

    ctx.restore();
  }

  getRadialRange() {
    const { maxVal, minVal } = this.getDataExtrema();
    if (!this.overlayConfig.dynamicRange) {
      return { rMin: 0, rMax: Math.max(1, maxVal) };
    }
    const span = Math.max(1e-6, maxVal - minVal);
    const margin = span * 0.08;
    const rMin = Math.max(0, minVal - margin);
    const rMax = maxVal + margin;
    return { rMin, rMax };
  }

  toRadius(val, radius) {
    const { rMin, rMax } = this.getRadialRange();
    const span = Math.max(1e-6, rMax - rMin);
    const norm = (val - rMin) / span;
    return Math.max(0.02, Math.min(1.15, norm)) * radius;
  }

  drawTargetReticle(ctx, pal) {
    ctx.save();
    // 红色激光微区同心瞄准环
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 瞄准十字线
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(-4, 0);
    ctx.moveTo(4, 0); ctx.lineTo(18, 0);
    ctx.moveTo(0, -18); ctx.lineTo(0, -4);
    ctx.moveTo(0, 4); ctx.lineTo(0, 18);
    ctx.stroke();

    // 聚焦点
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawPolarGrid(ctx, radius, pal) {
    const isDarkBg = this.overlayConfig.bgStyle === 'dark' || (!this.image);
    const gridColor = isDarkBg ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.55)';
    const textColor = isDarkBg ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.95)';

    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.lineWidth = 0.8;

    // 3 个同心圆 (33%, 66%, 100%)
    [0.33, 0.66, 1.0].forEach(factor => {
      ctx.beginPath();
      ctx.arc(0, 0, radius * factor, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 12 条角度辐射虚线 (每 30° 一条，逆时针标准数学极坐标: y = -sin(θ))
    ctx.setLineDash([2, 4]);
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(rad) * radius, -Math.sin(rad) * radius);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 主正交轴 (0°-180°, 90°-270°) 实线
    if (this.overlayConfig.showAxes) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = isDarkBg ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-radius * 1.03, 0); ctx.lineTo(radius * 1.03, 0);
      ctx.moveTo(0, -radius * 1.03); ctx.lineTo(0, radius * 1.03);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAngleLabels(ctx, radius, pal) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rotRad = ((this.overlayConfig.rotation || 0) * Math.PI) / 180;
    const labelRadius = radius * 1.1;
    const labels = [
      { text: '0°', angle: 0 },
      { text: '90°', angle: 90 },
      { text: '180°', angle: 180 },
      { text: '270°', angle: 270 }
    ];

    // 标准数学极坐标映射：90° 位于正上方 (12点钟)，270° 位于正下方 (6点钟)
    // 字符水平正立渲染 (Billboarded upright text)，旋转时永不颠倒
    labels.forEach(item => {
      const rad = (item.angle * Math.PI) / 180;
      const lx = Math.cos(rad) * labelRadius;
      const ly = -Math.sin(rad) * labelRadius;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rotRad);
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    });

    ctx.restore();
  }

  drawFitCurve(ctx, radius, pal, lineWidth) {
    const dense = this.polarData?.polarFit?.denseFitCurve;
    if (!dense || dense.length === 0) return;

    ctx.save();
    ctx.strokeStyle = pal.fit;
    ctx.lineWidth = lineWidth * 1.2;
    ctx.shadowColor = pal.fit;
    ctx.shadowBlur = 3;

    ctx.beginPath();
    dense.forEach(([deg, val], idx) => {
      const rad = (deg * Math.PI) / 180;
      const r = this.toRadius(val, radius);
      const x = Math.cos(rad) * r;
      const y = -Math.sin(rad) * r;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // 淡淡的半透明填充增添饱满感
    ctx.fillStyle = pal.fit.startsWith('#')
      ? `${pal.fit}22`
      : 'rgba(124, 58, 237, 0.12)';
    ctx.fill();

    ctx.restore();
  }

  drawErrorBand(ctx, radius, pal) {
    const stepStats = this.polarData?.stats?.stepStats;
    if (!Array.isArray(stepStats) || stepStats.length === 0) return;

    ctx.save();
    ctx.fillStyle = pal.errArea;

    // 外边界与内边界
    const outerPoints = [];
    const innerPoints = [];

    stepStats.forEach(s => {
      const deg = s.relAngle;
      const rad = (deg * Math.PI) / 180;
      const mean = s.mean;
      const sd = s.sd || 0;

      const rOuter = this.toRadius(mean + sd, radius);
      const rInner = this.toRadius(Math.max(0, mean - sd), radius);

      outerPoints.push({ x: Math.cos(rad) * rOuter, y: -Math.sin(rad) * rOuter });
      innerPoints.push({ x: Math.cos(rad) * rInner, y: -Math.sin(rad) * rInner });
    });

    ctx.beginPath();
    outerPoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    for (let i = innerPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(innerPoints[i].x, innerPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawDataPoints(ctx, radius, pal) {
    ctx.save();

    // 如果有分组数据，绘制离散实测点
    const groups = this.polarData?.groups || [];
    groups.forEach((group, gIdx) => {
      const color = (gIdx === 0 ? pal.points : (gIdx === 1 ? pal.mean : pal.fit));
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;

      (group.points || []).forEach(pt => {
        const rad = (pt.relAngle * Math.PI) / 180;
        const r = this.toRadius(pt.y, radius);
        const px = Math.cos(rad) * r;
        const py = -Math.sin(rad) * r;

        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    });

    // 绘制均值连接折线
    const stepStats = this.polarData?.stats?.stepStats;
    if (Array.isArray(stepStats) && stepStats.length > 0) {
      ctx.strokeStyle = pal.mean;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      stepStats.forEach((s, idx) => {
        const rad = (s.relAngle * Math.PI) / 180;
        const r = this.toRadius(s.mean, radius);
        const x = Math.cos(rad) * r;
        const y = -Math.sin(rad) * r;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    ctx.restore();
  }

  setData(parsedState) {
    this.polarData = parsedState;
    try {
      this.render();
    } catch (e) {
      console.warn('PolarOverlayManager render error:', e);
    }
  }

  setTheme(theme) {
    this.overlayConfig.theme = theme;
    try {
      this.render();
    } catch (e) {}
  }

  drawFastAxisIndicator(ctx, radius, pal) {
    const p = this.polarData?.polarFit?.params;
    const rawTheta0 = p?.thetaMax ?? p?.theta0 ?? p?.theta0Deg;
    const theta0 = parseFloat(rawTheta0);
    if (!Number.isFinite(theta0)) return;

    ctx.save();
    const rad = (theta0 * Math.PI) / 180;
    const oppRad = rad + Math.PI;

    // 贯穿整个极坐标的快轴 / 拟合最大值方向虚线 (逆时针极坐标映射)
    ctx.strokeStyle = pal.fastAxis;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.cos(oppRad) * radius * 1.06, -Math.sin(oppRad) * radius * 1.06);
    ctx.lineTo(Math.cos(rad) * radius * 1.06, -Math.sin(rad) * radius * 1.06);
    ctx.stroke();
    ctx.setLineDash([]);

    // 轴端端点光晕圆珠
    const endX = Math.cos(rad) * radius * 1.06;
    const endY = -Math.sin(rad) * radius * 1.06;
    ctx.fillStyle = pal.fastAxis;
    ctx.beginPath();
    ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 对称端点圆珠
    const oppX = Math.cos(oppRad) * radius * 1.06;
    const oppY = -Math.sin(oppRad) * radius * 1.06;
    ctx.beginPath();
    ctx.arc(oppX, oppY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 绘制精致的磨砂小胶囊标签，保持水平正立便于清晰阅读 (Billboarded upright text)
    const labelText = `拟合最大值 θmax = ${theta0.toFixed(1)}°`;
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    const textWidth = ctx.measureText(labelText).width;
    const pillPadX = 8;
    const pillW = textWidth + pillPadX * 2;
    const pillH = 22;

    const rotRad = ((this.overlayConfig.rotation || 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(rotRad); // 抵消极坐标自身旋转，使文字与胶囊永远水平正立可读

    // 在屏幕正交坐标系中计算避障偏移
    const worldAngle = rad - rotRad;
    const offsetX = Math.cos(worldAngle) >= 0 ? 8 : -pillW - 8;
    const offsetY = -Math.sin(worldAngle) >= 0 ? 6 : -pillH - 6;
    const pillX = offsetX;
    const pillY = offsetY;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = pal.fastAxis;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const r = 5;
    ctx.moveTo(pillX + r, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = pal.fastAxis;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, pillX + pillPadX, pillY + pillH / 2);

    ctx.restore();
  }

  drawAcademicBadge(ctx, width, height) {
    ctx.save();

    const pad = 16;
    const cardW = 240;
    const cardH = 88;
    const corner = this.overlayConfig.badgeCorner || 'bottom-right';

    let cardX = width - cardW - pad;
    let cardY = height - cardH - pad;

    if (corner === 'bottom-left') {
      cardX = pad;
      cardY = height - cardH - pad;
    } else if (corner === 'top-left') {
      cardX = pad;
      cardY = pad + 80; // 避开顶部悬浮工具栏
    } else if (corner === 'top-right') {
      cardX = width - cardW - pad;
      cardY = pad + 80;
    }

    // 半透明磨砂玻璃胶囊卡片底板
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;

    // 圆角矩形
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(cardX + r, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
    ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 卡片内文字与科学指标 (确保 θmax 100% 准确同步!)
    const sampleId = this.polarData?.metadata?.sampleId 
      || (this.isSampleImage ? (this.currentPresetSampleName || '2D Sample') : (this.imageName ? this.imageName : (this.polarData ? '极坐标数据就绪' : '等待导入数据')));
    const p = this.polarData?.polarFit?.params;
    // 关键修复：优先采用 thetaMax 作为最大光强方位角，彻底杜绝指标打架
    const rawTheta0 = p?.thetaMax ?? p?.theta0 ?? p?.theta0Deg;
    const numTheta = parseFloat(rawTheta0);
    const thetaStr = Number.isFinite(numTheta) ? `${numTheta.toFixed(1)}°` : 'N/A';

    const rot = this.overlayConfig.rotation || 0;
    let deltaThetaText = '';
    if (Number.isFinite(numTheta)) {
      let delta = Math.abs(numTheta - rot) % 180;
      if (delta > 90) delta = 180 - delta;
      deltaThetaText = ` · Δθ: ${delta.toFixed(1)}°`;
    }

    const rawER = this.polarData?.summary?.extinctionRatio;
    const numER = parseFloat(rawER);
    const erStr = Number.isFinite(numER) ? (numER > 999 ? '>999' : numER.toFixed(1)) : (rawER || 'N/A');
    const rawERDB = this.polarData?.summary?.extinctionRatioDB;
    const erDBStr = rawERDB ? ` (${rawERDB} dB)` : '';

    const rawDolp = this.polarData?.summary?.dolp ?? p?.dolp;
    const numDolp = parseFloat(rawDolp);

    const r2Val = p?.rSquaredPercent ? `${p.rSquaredPercent}%` : (p?.rSquared ? `${(p.rSquared * 100).toFixed(1)}%` : null);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🔬 ${sampleId}`, cardX + 12, cardY + 20);

    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#94a3b8';
    const r2Text = r2Val ? ` · R²: ${r2Val}` : '';
    ctx.fillText(`Align: ${rot}°${deltaThetaText}${r2Text}`, cardX + 12, cardY + 38);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`θmax: ${thetaStr}  |  ER: ${erStr}${erDBStr}`, cardX + 12, cardY + 54);

    if (Number.isFinite(numDolp)) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`DoLP: ${(numDolp * 100).toFixed(1)}% (调制度代理)`, cardX + 12, cardY + 70);
    } else {
      ctx.fillStyle = this.image ? '#a78bfa' : '#64748b';
      ctx.fillText(this.image ? '底图: 已叠加光学显微图' : '底图: 待导入光学显微图', cardX + 12, cardY + 70);
    }

    ctx.restore();
  }

  getDataExtrema() {
    let maxVal = -Infinity;
    let minVal = Infinity;

    // 1. 从 stepStats 统计步中获取范围 (mean, sd, sampleValues)
    const stepStats = this.polarData?.stats?.stepStats;
    if (Array.isArray(stepStats) && stepStats.length > 0) {
      stepStats.forEach(s => {
        const samples = (s.sampleValues || s.values || []).filter(Number.isFinite);
        if (Number.isFinite(s.mean)) {
          minVal = Math.min(minVal, s.mean - (s.sd || 0), ...samples);
          maxVal = Math.max(maxVal, s.mean + (s.sd || 0), ...samples);
        }
      });
    }

    // 2. 从 groups 原始点中获取
    if (this.polarData?.groups?.length) {
      this.polarData.groups.forEach(g => {
        (g.points || []).forEach(p => {
          if (Number.isFinite(p.y)) {
            minVal = Math.min(minVal, p.y);
            maxVal = Math.max(maxVal, p.y);
          }
        });
      });
    }

    // 3. 从 denseFitCurve 理论曲线中获取
    if (this.polarData?.polarFit?.denseFitCurve?.length) {
      this.polarData.polarFit.denseFitCurve.forEach(([_, val]) => {
        if (Number.isFinite(val)) {
          minVal = Math.min(minVal, val);
          maxVal = Math.max(maxVal, val);
        }
      });
    }

    // 4. 回退处理
    if (!Number.isFinite(maxVal) || maxVal === -Infinity) {
      maxVal = this.polarData?.summary?.maxIntensity ?? 1;
      minVal = this.polarData?.summary?.minIntensity ?? 0;
    }
    return { maxVal: Math.max(1, maxVal), minVal: Number.isFinite(minVal) ? minVal : 0 };
  }

  /**
   * 出版级高分辨率图片导出 (1x, 2x, 4x / 300DPI 4K)
   * 支持无损 PNG / JPEG / WebP
   */
  async exportOverlayImage(options = {}) {
    const {
      format = 'png',
      scale = 3, // 3x 为 300 DPI 4K 出版级高清
      filename = null
    } = options;

    if (!this.canvas) return;

    // 获取目标导出尺寸
    const baseW = this.canvas.width;
    const baseH = this.canvas.height;
    const exportW = Math.round(baseW * scale);
    const exportH = Math.round(baseH * scale);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = exportW;
    offCanvas.height = exportH;
    const offCtx = offCanvas.getContext('2d');

    // 缩放上下文至指定高分辨率
    offCtx.scale(scale, scale);

    // 临时切换上下文绘制高分辨率画布
    const origCtx = this.ctx;
    const origCanvas = this.canvas;
    this.ctx = offCtx;
    this.canvas = { width: baseW, height: baseH, getBoundingClientRect: () => origCanvas.getBoundingClientRect() };

    try {
      this.render();
    } finally {
      this.ctx = origCtx;
      this.canvas = origCanvas;
    }

    const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
    const quality = format === 'jpeg' ? 0.95 : undefined;
    const dataUrl = offCanvas.toDataURL(mimeType, quality);

    const sampleName = this.polarData?.metadata?.sampleId ? `_${this.polarData.metadata.sampleId}` : '';
    const dateStamp = new Date().toISOString().slice(0, 10);
    const finalName = filename || `polar_micrograph_overlay${sampleName}_${dateStamp}.${format}`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

if (typeof window !== 'undefined') {
  window.PolarOverlayManager = PolarOverlayManager;
}
