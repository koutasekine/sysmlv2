// view-frame: 型が GeneralView の view の枠と、公開した要素
package Fleet {
    part def Vehicle;
    part def Car :> Vehicle;
    part def Hidden;
    view fleetView : GeneralView {
        expose Fleet::Vehicle;
        expose Fleet::Car;
    }
}
