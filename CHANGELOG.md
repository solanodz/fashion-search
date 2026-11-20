# Changelog

## [0.5.0](https://github.com/solanodz/fashion-search/compare/v0.4.0...v0.5.0) (2026-11-20)


### Features

* **infra:** keep the free Qdrant Cloud cluster in use ([#59](https://github.com/solanodz/fashion-search/issues/59)) ([0f401c2](https://github.com/solanodz/fashion-search/commit/0f401c2656ecc0825683b03aff03400af103a171))
* **outfit:** shop the look from a photo of a person ([#60](https://github.com/solanodz/fashion-search/issues/60)) ([4d8f892](https://github.com/solanodz/fashion-search/commit/4d8f892697502bfcfbc5e23d6ba91453300aa844))

## [0.4.0](https://github.com/solanodz/fashion-search/compare/v0.3.0...v0.4.0) (2026-11-20)


### Features

* **images:** host catalog images on Cloudflare R2 ([#34](https://github.com/solanodz/fashion-search/issues/34)) ([e615989](https://github.com/solanodz/fashion-search/commit/e61598939d463b981ecba81395389d69d994717b))
* **indexing:** use 384×512 catalog photos ([#36](https://github.com/solanodz/fashion-search/issues/36)) ([8beb579](https://github.com/solanodz/fashion-search/commit/8beb57979b07ad64f1966e1aca58117b3b46574c))
* **search:** compare image, keyword and hybrid results ([#54](https://github.com/solanodz/fashion-search/issues/54)) ([a83a3fe](https://github.com/solanodz/fashion-search/commit/a83a3feb0f05c38bf0b345391bc3a70036f24c5e))
* **search:** hybrid search with keyword vectors ([#50](https://github.com/solanodz/fashion-search/issues/50)) ([8aec06b](https://github.com/solanodz/fashion-search/commit/8aec06bdb58d40dae761961527c01668a02bb68a))
* **search:** search in Spanish with a fashion glossary ([#53](https://github.com/solanodz/fashion-search/issues/53)) ([1696a30](https://github.com/solanodz/fashion-search/commit/1696a3058c14dc8453e963a1eae127a59ce1f19f))
* **ui:** "Why?" shows what made a result match ([#56](https://github.com/solanodz/fashion-search/issues/56)) ([c519517](https://github.com/solanodz/fashion-search/commit/c51951766fddc9242da355ff74d74354336bd1bf))
* **ui:** how-it-works guide, a 3D embedding space and a fitted sidebar ([#52](https://github.com/solanodz/fashion-search/issues/52)) ([f8ed024](https://github.com/solanodz/fashion-search/commit/f8ed0242ced62dd36b575db5e16d60700b296f9c))
* **ui:** map of the embedding space ([#51](https://github.com/solanodz/fashion-search/issues/51)) ([5af0e6f](https://github.com/solanodz/fashion-search/commit/5af0e6f2e2c9de035fe3a7f8b5558386fa12d382))
* **ui:** minimal layout with a live pipeline and similarity scores ([#37](https://github.com/solanodz/fashion-search/issues/37)) ([435d1c0](https://github.com/solanodz/fashion-search/commit/435d1c03a98800dc2e9fc683a8753f2004423d76))
* **ui:** photo and text similarity per result ([#49](https://github.com/solanodz/fashion-search/issues/49)) ([3997782](https://github.com/solanodz/fashion-search/commit/3997782534a0b2b4e25e2835e45fd9d1d8e6c384))
* **ui:** public evaluation page ([#57](https://github.com/solanodz/fashion-search/issues/57)) ([7981dfa](https://github.com/solanodz/fashion-search/commit/7981dfa9dff28f3634ca15d4d5c54dfb915e8a0d))
* **ui:** shareable search URLs ([#48](https://github.com/solanodz/fashion-search/issues/48)) ([7cfe2df](https://github.com/solanodz/fashion-search/commit/7cfe2dfbac7d4cd038b70dd28f2afd78357b0378))

## [0.3.0](https://github.com/solanodz/fashion-search/compare/v0.2.0...v0.3.0) (2026-11-19)


### Features

* **search:** filter by gender, category, type and colour ([#33](https://github.com/solanodz/fashion-search/issues/33)) ([2fc117a](https://github.com/solanodz/fashion-search/commit/2fc117ab81dfa9eee3e5c820e578f7b0969e8a26))
* **search:** search the catalog by text ([#28](https://github.com/solanodz/fashion-search/issues/28)) ([9930512](https://github.com/solanodz/fashion-search/commit/99305126aa5185a203f49bdfd809fd87683e3c1c))
* **search:** search with a photo, alone or refined by text ([#31](https://github.com/solanodz/fashion-search/issues/31)) ([f0947d4](https://github.com/solanodz/fashion-search/commit/f0947d4b8c191c345f7b188fa58bb6ce38895e16))

## [0.2.0](https://github.com/solanodz/fashion-search/compare/v0.1.0...v0.2.0) (2026-11-19)


### Features

* **indexing:** add a shared CLIP encoder module ([#21](https://github.com/solanodz/fashion-search/issues/21)) ([67c1fa0](https://github.com/solanodz/fashion-search/commit/67c1fa079d22242389e5aa1b7b19a5b14e4ed9f6))
* **indexing:** compute catalog embeddings ([#24](https://github.com/solanodz/fashion-search/issues/24)) ([3ebd299](https://github.com/solanodz/fashion-search/commit/3ebd29979663d4d533a796636dc9c14b86bc8912))
* **indexing:** create the Qdrant collection and upload vectors ([#25](https://github.com/solanodz/fashion-search/issues/25)) ([b447210](https://github.com/solanodz/fashion-search/commit/b4472104d3feb0af8b8b372a341ad7bd4949a5a6))
* **indexing:** evaluate retrieval quality ([#26](https://github.com/solanodz/fashion-search/issues/26)) ([d6faa9f](https://github.com/solanodz/fashion-search/commit/d6faa9f1d9e8cd99777429df8c69a8c43213b1cd))
* **indexing:** prepare the catalog from the dataset ([#20](https://github.com/solanodz/fashion-search/issues/20)) ([6067891](https://github.com/solanodz/fashion-search/commit/60678911280590e2c0e2aa24c5d321a4ebd8f270))
