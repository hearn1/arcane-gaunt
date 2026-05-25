function clone(source) {
  const sourceLookup = new Map();
  const cloneLookup = new Map();
  const cloned = source.clone(true);

  parallelTraverse(source, cloned, (sourceNode, clonedNode) => {
    sourceLookup.set(clonedNode, sourceNode);
    cloneLookup.set(sourceNode, clonedNode);
  });

  cloned.traverse((node) => {
    if (!node.isSkinnedMesh) return;

    const clonedMesh = node;
    const sourceMesh = sourceLookup.get(node);
    const sourceBones = sourceMesh.skeleton.bones;
    const clonedBones = sourceBones.map((bone) => cloneLookup.get(bone));

    clonedMesh.skeleton = sourceMesh.skeleton.clone();
    clonedMesh.skeleton.bones = clonedBones;
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);
    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
  });

  return cloned;
}

function parallelTraverse(a, b, callback) {
  callback(a, b);

  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i], b.children[i], callback);
  }
}

export { clone };
