import { MeshLambertMaterial, MeshPhongMaterial } from 'three';

export const lambert = (color) => new MeshLambertMaterial({ color });
export const phong = (color, shininess = 25, extra = {}) => new MeshPhongMaterial({ color, shininess, ...extra });
