// 生徒の規模のモデル(GR10 P1 の裁定 Q11): 部品の使用 15 個、一般ビューの線 30 本ほど。
// 描く時間と図の質を記録する(GR10 P2 の帯の線引きの裁定。線の本数の上限は設けない)
package RobotVacuum {
    doc /* お掃除ロボットの構成 */
    part def Robot {
        attribute mass;
        part body : Body;
        part battery : Battery;
        part motorL : Motor;
        part motorR : Motor;
        part wheelL : Wheel;
        part wheelR : Wheel;
        part brush : Brush;
        part dustBin : DustBin;
        part bumper : BumpSensor;
        part cliff : CliffSensor;
        part controller : Controller;
    }
    part def Body;
    part def Battery {
        attribute capacity;
    }
    part def Motor;
    part def Wheel;
    part def Brush;
    part def DustBin;
    part def Sensor;
    part def BumpSensor :> Sensor;
    part def CliffSensor :> Sensor;
    part def Controller {
        part cpu : Cpu;
        part memory : Memory;
    }
    part def Cpu;
    part def Memory;
    part def DockStation;
    part robot : Robot;
    part dock : DockStation;
    dependency charges from dock to robot;
}
