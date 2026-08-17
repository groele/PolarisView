/**
 * presets-data.js
 * 预设光学偏振测量与仿真数据集仓库
 */

const PolarizationPresets = {
  // 1. 实测数据
  'real_pol': {
    name: '实测数据 (Pol.txt - 旋转两周 73 点)',
    description: '实验室使用 1/2 波片操纵旋转一周半测得的真实探测器计数数据，含微弱底噪。',
    multiplier: 10,
    data: `0\t7119\n1\t7191\n2\t7152\n3\t7096\n4\t7050\n5\t7124\n6\t7394\n7\t7791\n8\t8361\n9\t8712\n10\t8853\n11\t8763\n12\t8465\n13\t8069\n14\t7541\n15\t7236\n16\t7084\n17\t7072\n18\t7147\n19\t7195\n20\t7171\n21\t7107\n22\t7079\n23\t7129\n24\t7308\n25\t7696\n26\t8108\n27\t8498\n28\t8776\n29\t8728\n30\t8408\n31\t8078\n32\t7594\n33\t7261\n34\t7095\n35\t7060\n36\t7134\n37\t7157\n38\t7157\n39\t7097\n40\t7033\n41\t7096\n42\t7323\n43\t7667\n44\t8139\n45\t8517\n46\t8709\n47\t8749\n48\t8444\n49\t8037\n50\t7594\n51\t7251\n52\t7123\n53\t7080\n54\t7145\n55\t7221\n56\t7201\n57\t7134\n58\t7059\n59\t7130\n60\t7365\n61\t7744\n62\t8205\n63\t8614\n64\t8804\n65\t8767\n66\t8475\n67\t8032\n68\t7544\n69\t7245\n70\t7075\n71\t7106\n72\t7127`
  },

  // 2. 理想半波片仿真
  'ideal_hwp': {
    name: '理想半波片仿真 (Ideal Malus HWP)',
    description: '标准理论马吕斯曲线 (I = 1000 * cos^2(2*theta) + 20)，消光比接近理想极值。',
    multiplier: 10,
    data: (() => {
      const rows = [];
      for (let x = 0; x <= 72; x++) {
        const th = (x * 10 * Math.PI) / 180;
        const y = Math.round(1000 * Math.pow(Math.cos(2 * th - 0.2), 2) + 20);
        rows.push(`${x}\t${y}`);
      }
      return rows.join('\n');
    })()
  },

  // 3. 带有相位延迟误差的波片 (delta = 165度)
  'retardance_error': {
    name: '相位延迟偏差波片 (Retardance Error δ=165°)',
    description: '波片制作误差导致延迟量偏离 180°，在极坐标中出现次级谐波形变与消光恶化。',
    multiplier: 10,
    data: (() => {
      const rows = [];
      for (let x = 0; x <= 72; x++) {
        const th = (x * 10 * Math.PI) / 180;
        // 含有显著的 cos(2*th) 分量
        const y = Math.round(900 * Math.pow(Math.cos(2 * th), 2) + 180 * Math.pow(Math.cos(th), 2) + 80);
        rows.push(`${x}\t${y}`);
      }
      return rows.join('\n');
    })()
  },

  // 4. 线性基线漂移样本
  'linear_drift': {
    name: '光源线性漂移样本 (Linear Power Drift)',
    description: '测量过程中光源功率缓慢线性上升，导致各周波峰呈现倾斜阶梯。适合测试基线扣除。',
    multiplier: 10,
    data: (() => {
      const rows = [];
      for (let x = 0; x <= 72; x++) {
        const th = (x * 10 * Math.PI) / 180;
        const drift = x * 15; // 线性漂移
        const y = Math.round(1000 * Math.pow(Math.cos(2 * th), 2) + 500 + drift);
        rows.push(`${x}\t${y}`);
      }
      return rows.join('\n');
    })()
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.PolarizationPresets = PolarizationPresets;
}
