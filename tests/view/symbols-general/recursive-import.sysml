// recursive-import: 外枠の中の要素が持つ、再帰の import の線(private)
package Plant {
    package Parts;
    package Station {
        private import Plant::Parts::**;
    }
}
