Developer Release Procedure
===========================

To release a new version of the widgets on PyPI and npm, first checkout master
and cd into the repo root.

### Publish the npm modules

```
npm whoami # check to make sure logged in
# clean out all dirty files
git checkout master
git pull origin master
git reset --hard origin/master
git clean -fdx
yarn
yarn run publish
```

Lerna will prompt you for version numbers for each of the changed npm packages. Lerna will then change the versions appropriately (including the interdependency versions), commit, tag, and publish the new packages to npm.

### widgetsnbextension

Go into the `widgetsnbextension` directory. Change `widgetsnbextension/_version.py` to reflect the new version number.
```
python setup.py sdist
python setup.py bdist_wheel --universal
twine upload dist/*
```

### ipywidgets

Change `ipywidgets/_version.py` to reflect the new version number, and if necessary, a new `__html_manager_version__`. Change the `install_requires` parameter in `setup.py` reference the new widgetsnbextension version.

```
python setup.py sdist
python setup.py bdist_wheel --universal
twine upload dist/*
```

### Push changes back

commit and tag (ipywidgets) release


Release Notes
=============

Here is an example of the release statistics for ipywidgets 7.0.

It has been 157 days since the last release. In this release, we closed [127 issues](https://github.com/jupyter-widgets/ipywidgets/issues?q=is%3Aissue+is%3Aclosed+milestone%3A7.0) and [216 pull requests](https://github.com/jupyter-widgets/ipywidgets/pulls?q=is%3Apr+milestone%3A7.0+is%3Aclosed) with [1069](https://github.com/jupyter-widgets/ipywidgets/compare/6.0.0...7.0.0) commits, of which 851 are not merges.

It has been 91 days since the last release, 7.1.0. In this release, we closed [20 issues](https://github.com/jupyter-widgets/ipywidgets/issues?q=is%3Aissue+milestone%3A7.2+is%3Aclosed) and [44 pull requests](https://github.com/jupyter-widgets/ipywidgets/pulls?q=is%3Apr+milestone%3A7.2+is%3Aclosed) with [187](https://github.com/jupyter-widgets/ipywidgets/compare/7.1.0...master) commits touching 77 files, which includes 135 non-merge commits.

We'd like to thank the following contributors to the ipywidgets codebase in this repository. We had 18 contributors, of which 13 are new contributors (denoted with a *).

*Anand Chitipothu
*Antonino Ingargiola
*DougRzz
*Dustin Michels
*Fabien Vinas
Jason Grout
*Jeremy Tuloup
Maarten Breddels
*Madhu94
*Madhumitha Natarajan
Pascal Bugnion
*Paul Ganssle
*Romain Primet
*Ryan Morshead
*Sebastian Gutsche
*Stephanie Stattel
Sylvain Corlay
Vidar Tonaas Fauske

Also of particular note, [149](https://github.com/jupyter-widgets/ipywidgets/issues?q=is%3Aissue+is%3Aclosed+closed%3A%222016-12-27+..+2018-03-28%22+milestone%3AReference) "Reference" issues were closed in this time period. These issues archive answered questions and other discussions with community members, and represent a tremendous amount of effort to engage with the community.




Here are some commands used to generate some of the statistics above.

```
# date of 7.1.0 tag
git show -s --format=%cd --date=short 7.1.0^{commit}

# issues closed with no milestone in the time period
# is:issue is:closed closed:"2016-07-14 .. 2017-02-28"

# merges since in 6.0.0, but not 7.0.0, which is a rough list of merged PRs
git log --merges 7.1.0...master --pretty=oneline

# To really make sure we get all PRs, we could write a program that
# pulled all of the PRs, examined a commit in each one, and did
# `git tag --contains <commit number>` to see if that PR commit is included
# in a previous release.

# Non-merge commits in 7.0.0 not in any 6.x release
git log --pretty=oneline --no-merges ^7.1.0 master | wc -l

# Authors of non-merge commits
git shortlog -s  7.1.0..master --no-merges | cut -c8- | sort -f

# New committers: authors unique in the 7.1.0..7.0.0 logs, but not in the 7.1.0 log
comm -23 <(git shortlog -s -n 7.1.0..master --no-merges | cut -c8- | sort) <(git shortlog -s -n 7.1.0 --no-merges | cut -c8- | sort) | sort -f
```
