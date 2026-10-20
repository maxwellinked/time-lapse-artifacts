// Explicit owner instructions, 2026-10-20. Applied after source EXIF orientation.
// Bind the correction to both identities; never infer it for another photograph.
const CLOCKWISE_ROTATIONS = {
  "tlaw-27d91c3c3ca5d9e3": "c24524fc0dc6a2ae8f05175861733b246cbdf4954e4cedc9c4d80605eb651a42",
  "tlaw-a77d16972149f232": "efc4ca40a9f58cf8be4dbcf9add537ddb5b6aaa83cdf404e271e5159df9a6ed1",
  "tlaw-3c632c55f324b287": "383812a0374f75bfb4c8285b90c64e3cc836a3dbbf47003b14903fa9b34c92be",
  "tlaw-ed372076fbc9d7c6": "f84ae9326d33cabca20f33bd5af6d2149389bd1c0876b36fbebb63365b2b5be2",
};

export function getPhotographDisplayRotation(image) {
  return image && CLOCKWISE_ROTATIONS[image.work_id] === image.sha256 &&
    typeof image.sha256 === "string" ? 90 : 0;
}
