/**
 * presets-data.js
 * 预设实验与仿真数据集仓库
 */

const PolarizationPresets = {
  // 1. 实测 Pol.txt 旋转两周 73点数据
  real_pol: {
    name: '实测数据 (Pol.txt - 旋转两周 73 点)',
    description: '半波片旋转测量的真实实验数据，包含探测器本底暗电流与微弱机械旋转偏差。',
    multiplier: 10,
    // Canonical source: Pol.txt.  Keep this literal content aligned with
    // the shipped sample; a prior divergent copy created false cycle mismatch.
    data: `0\t7119
1\t7191
2\t7152
3\t7096
4\t7050
5\t7124
6\t7394
7\t7791
8\t8361
9\t8712
10\t8853
11\t8763
12\t8465
13\t8069
14\t7541
15\t7236
16\t7084
17\t7072
18\t7147
19\t7195
20\t7171
21\t7107
22\t7079
23\t7129
24\t7308
25\t7696
26\t8108
27\t8498
28\t8776
29\t8728
30\t8408
31\t8078
32\t7594
33\t7261
34\t7095
35\t7060
36\t7134
37\t7157
38\t7157
39\t7097
40\t7033
41\t7096
42\t7323
43\t7667
44\t8139
45\t8517
46\t8709
47\t8749
48\t8444
49\t8037
50\t7594
51\t7251
52\t7123
53\t7080
54\t7145
55\t7221
56\t7201
57\t7134
58\t7059
59\t7130
60\t7365
61\t7744
62\t8205
63\t8614
64\t8804
65\t8767
66\t8475
67\t8032
68\t7544
69\t7245
70\t7075
71\t7106
72\t7127`
  },

  // 2. 理想半波片仿真 (极优消光比，Ibg=0)
  ideal_hwp: {
    name: '理论仿真: 理想 1/2 波片 (消光比极优)',
    description: '理想半波片马吕斯定律理论曲线，I(θ) = (I0/2)[1 + cos(4(θ - 15°))]，消光比趋于无穷。',
    multiplier: 10,
    data: Array.from({ length: 73 }, (_, i) => {
      const theta = (i * 10 * Math.PI) / 180;
      const theta0 = (15 * Math.PI) / 180;
      const y = Math.round(1800 * Math.pow(Math.cos(2 * (theta - theta0)), 2));
      return `${i}\t${y}`;
    }).join('\n')
  },

  // 3. 相位延迟误差仿真 (δ = 165°，产生椭圆偏振与残余底光)
  retardance_error: {
    name: '误差仿真: 相位延迟偏差波片 (δ=165°)',
    description: '波片制作厚度偏差导致相位延迟并非精确 180°，出射为椭圆偏振光，产生残余光强。',
    multiplier: 10,
    data: Array.from({ length: 73 }, (_, i) => {
      const theta = (i * 10 * Math.PI) / 180;
      const delta = (165 * Math.PI) / 180;
      const I0 = 1800;
      const bg = 500;
      // 琼斯矩阵反演强度
      const y = Math.round(bg + I0 * (Math.pow(Math.cos(2 * theta), 2) + Math.pow(Math.sin(2 * theta), 2) * Math.pow(Math.cos(delta), 2)));
      return `${i}\t${y}`;
    }).join('\n')
  },

  // 4. 光源线性漂移仿真
  linear_drift: {
    name: '漂移仿真: 光源线性功率漂移样本',
    description: '模拟激光器发热或电池电量下降导致的单调线性功率衰减 (Drift)。',
    multiplier: 10,
    data: Array.from({ length: 73 }, (_, i) => {
      const theta = (i * 10 * Math.PI) / 180;
      const drift = -3.5 * i + 7200;
      const y = Math.round(drift + 1750 * Math.pow(Math.cos(2 * (theta - 0.2)), 2));
      return `${i}\t${y}`;
    }).join('\n')
  }
};

if (typeof window !== 'undefined') {
  window.PolarizationPresets = PolarizationPresets;
}
