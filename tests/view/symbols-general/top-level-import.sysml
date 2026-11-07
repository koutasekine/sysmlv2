// top-level-import: 外枠の中の要素が持つ、名前空間の中身の import の線
package Plant {
    package Parts;
    package Station {
        public import Plant::Parts::*;
    }
}
