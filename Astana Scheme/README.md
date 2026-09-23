# Astana Scheme

Минималистичная интерактивная схема 5 районов Астаны: Есиль, Алматы, Сарыарка, Байконур, Нура.

- `index.html` — схема в одном файле, сборка не нужна. Клик по району или по его названию выбирает район, повторный клик снимает выбор.
- `astana_districts.geojson` — границы районов (FeatureCollection, MultiPolygon, упрощены до ~40 м).

## Интеграция

```js
window.addEventListener("district-select", e => {
  console.log(e.detail); // { id: "esil", name: "Есиль" } или null
});
window.astanaScheme.select("nura"); // выбрать район из кода
```

id районов: `esil`, `almaty`, `saryarka`, `baikonur`, `nura`.

Границы: © участники OpenStreetMap, лицензия ODbL.
