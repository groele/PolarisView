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
    data: `0\t7119
1\t7191
2\t7475
3\t7850
4\t8369
5\t8674
6\t8853
7\t8713
8\t8498
9\t7958
10\t7563
11\t7225
12\t7079
13\t7070
14\t7200
15\t7480
16\t7861
17\t8340
18\t8707
19\t8802
20\t8714
21\t8389
22\t7967
23\t7520
24\t7177
25\t7075
26\t7096
27\t7265
28\t7574
29\t8009
30\t8446
31\t8747
32\t8808
33\t8636
34\t8287
35\t7783
36\t7390
37\t7120
38\t7033
39\t7140
40\t7406
41\t7801
42\t8270
43\t8617
44\t8761
45\t8699
46\t8378
47\t7913
48\t7481
49\t7170
50\t7062
51\t7131
52\t7334
53\t7692
54\t8161
55\t8553
56\t8771
57\t8730
58\t8462
59\t8074
60\t7641
61\t7274
62\t7088
63\t7083
64\t7251
65\t7579
66\t8047
67\t8479
68\t8769
69\t8797
70\t8607
71\t8224
72\t7746`
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
