version=v0.6.0
echo $version
git commit -am $version
git tag $version
git push
git push --tags