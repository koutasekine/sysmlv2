// gr12-allocation: 割り当ての定義と使用(箱)と、端が 2 つの割り当ての線 «allocate»(GR12 P1 の裁定 Q4。端は箱か区画の行)
package Deployment {
    allocation def Deploy;
    allocation plan : Deploy;
    part def Board {
        attribute memory;
    }
    part software;
    part board : Board;
    allocate software to board;
    allocation main : Deploy allocate software to Board::memory;
}
